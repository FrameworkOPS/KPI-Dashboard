import { Router, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getQBOSummary } from '../services/qboService';
import { connect, callback, disconnect, reconnect, status, refreshQBOToken } from '../controllers/qboOAuthController';
import {
  isJobNimbusConfigured,
  getJobNimbusSummary,
  getJobNimbusAnalytics,
  syncJobNimbus,
  getJobNimbusSyncMeta,
} from '../services/jobNimbusService';

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

// Analytics endpoint for live JobNimbus dashboard
router.get('/jobnimbus/analytics', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const configured = await isJobNimbusConfigured();
    if (!configured) {
      res.status(503).json({ error: 'JobNimbus API not configured' });
      return;
    }
    const days = Math.min(Math.max(parseInt(String(req.query.days || '90')) || 90, 1), 365 * 5);
    const analytics = await getJobNimbusAnalytics(days);
    res.json(analytics);
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
