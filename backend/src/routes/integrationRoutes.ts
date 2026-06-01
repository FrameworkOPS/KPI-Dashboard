import { Router, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getQBOSummary } from '../services/qboService';
import { connect, callback, disconnect, reconnect, status, refreshQBOToken } from '../controllers/qboOAuthController';
import {
  isJobNimbusConfigured,
  getJobNimbusSummary,
  getJobNimbusAnalytics,
  getJobNimbusJobs,
  getJobNimbusTargets,
  setJobNimbusTargets,
  jobsToCsv,
  syncJobNimbus,
  getJobNimbusSyncMeta,
} from '../services/jobNimbusService';

// ISO date / datetime string → Date, or null if absent/invalid.
function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const router = Router();

// ── QuickBooks Online ──────────────────────────────────────────────────────────

router.get('/qbo', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    try {
      await refreshQBOToken();
    } catch {
      // non-fatal; getQBOSummary will throw if truly broken
    }
    const summary = await getQBOSummary();
    res.json(summary);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('QuickBooks') || error.message.includes('QBO')) {
      res.status(503).json({ error: 'QuickBooks Online integration is not configured or token expired', detail: error.message });
      return;
    }
    next(err);
  }
});

router.get('/qbo/connect', authenticate, requireAdmin, connect);
router.get('/qbo/callback', callback);
router.post('/qbo/disconnect', authenticate, requireAdmin, disconnect);
router.get('/qbo/reconnect', authenticate, requireAdmin, reconnect);
router.get('/qbo/status', authenticate, requireLeadershipOrAdmin, status);

// ── JobNimbus (direct REST API model) ──────────────────────────────────────────

// Connection status + last-sync info — admin/leadership can view
router.get('/jobnimbus/status', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connected = await isJobNimbusConfigured();
    const meta = connected ? await getJobNimbusSyncMeta() : { last_sync: null, last_count: null };
    res.json({ connected, mode: 'api', last_sync: meta.last_sync, last_count: meta.last_count });
  } catch (err) {
    next(err);
  }
});

// Analytics endpoint for live JobNimbus dashboard.
// Accepts either ?from=&to= (preferred, ISO) or ?days= (back-compat).
// Optional: ?compare_from=&compare_to=&rep=&source=&record_type=
router.get('/jobnimbus/analytics', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const configured = await isJobNimbusConfigured();
    if (!configured) {
      res.status(503).json({ error: 'JobNimbus API not configured' });
      return;
    }
    const now = new Date();
    let from = parseDate(req.query.from);
    let to = parseDate(req.query.to);
    if (!from || !to) {
      const days = Math.min(Math.max(parseInt(String(req.query.days || '90')) || 90, 1), 365 * 5);
      to = now;
      from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    const compareFrom = parseDate(req.query.compare_from);
    const compareTo = parseDate(req.query.compare_to);
    const analytics = await getJobNimbusAnalytics({
      from, to, compareFrom, compareTo,
      rep: (req.query.rep as string) || null,
      source: (req.query.source as string) || null,
      recordType: (req.query.record_type as string) || null,
    });
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

// Targets — admin or leadership can view; admin can write.
router.get('/jobnimbus/targets', authenticate, requireLeadershipOrAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const targets = await getJobNimbusTargets();
    res.json(targets);
  } catch (err) {
    next(err);
  }
});

router.put('/jobnimbus/targets', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const num = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const targets = await setJobNimbusTargets({
      weekly_sold:    num(body.weekly_sold),
      monthly_sold:   num(body.monthly_sold),
      weekly_billed:  num(body.weekly_billed),
      monthly_billed: num(body.monthly_billed),
    });
    res.json(targets);
  } catch (err) {
    next(err);
  }
});

// Summary from DB (data pulled from the JobNimbus API)
router.get('/jobnimbus', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const configured = await isJobNimbusConfigured();
    if (!configured) {
      res.status(503).json({ error: 'JobNimbus API not configured' });
      return;
    }
    const summary = await getJobNimbusSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Drill-down: list the underlying jobs for a dimension/bucket.
// Accepts the same period + filter params as /analytics.
// Pass ?format=csv to get a downloadable CSV instead of JSON.
router.get('/jobnimbus/jobs', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await isJobNimbusConfigured())) {
      res.status(503).json({ error: 'JobNimbus API not configured' });
      return;
    }
    const dimension = String(req.query.dimension || 'all');
    const key = req.query.key !== undefined ? String(req.query.key) : undefined;
    const days = req.query.days !== undefined ? parseInt(String(req.query.days), 10) : undefined;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const result = await getJobNimbusJobs({
      dimension, key, days,
      from: from || undefined, to: to || undefined,
      rep: (req.query.rep as string) || null,
      source: (req.query.source as string) || null,
      recordType: (req.query.record_type as string) || null,
      limit: req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : undefined,
    });
    if (String(req.query.format || '').toLowerCase() === 'csv') {
      const safeName = `jobnimbus-${dimension}${key ? '-' + key.replace(/[^\w-]+/g, '_') : ''}-${new Date().toISOString().slice(0,10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.send(jobsToCsv(result.jobs));
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Trigger an on-demand sync from the JobNimbus API — admin only
router.post('/jobnimbus/sync', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!(await isJobNimbusConfigured())) {
      res.status(503).json({ error: 'JOBNIMBUS_API_KEY is not set on the server' });
      return;
    }
    const result = await syncJobNimbus();
    const meta = await getJobNimbusSyncMeta();
    res.json({ ...result, last_sync: meta.last_sync });
  } catch (err) {
    const error = err as any;
    const apiStatus = error?.response?.status;
    if (apiStatus === 401 || apiStatus === 403) {
      res.status(502).json({ error: 'JobNimbus rejected the API key (check JOBNIMBUS_API_KEY)' });
      return;
    }
    next(err);
  }
});

export default router;
