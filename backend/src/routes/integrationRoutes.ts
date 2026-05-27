import { Router, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getQBOSummary } from '../services/qboService';
import { connect, callback, disconnect, reconnect, status, refreshQBOToken } from '../controllers/qboOAuthController';
import {
  isJobNimbusConfigured,
  setJobNimbusApiKey,
  removeJobNimbusApiKey,
  getJobNimbusSummary,
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

// ── JobNimbus ─────────────────────────────────────────────────────────────────

router.get('/jobnimbus/status', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const configured = await isJobNimbusConfigured();
    res.json({ connected: configured });
  } catch (err) {
    next(err);
  }
});

router.get('/jobnimbus', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await getJobNimbusSummary();
    res.json(summary);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('not configured')) {
      res.status(503).json({ error: 'JobNimbus API key not configured' });
      return;
    }
    if (error.message.includes('401') || error.message.includes('403')) {
      res.status(503).json({ error: 'JobNimbus API key is invalid' });
      return;
    }
    next(err);
  }
});

router.post('/jobnimbus/configure', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { api_key } = req.body;
    if (!api_key || typeof api_key !== 'string' || !api_key.trim()) {
      res.status(400).json({ error: 'api_key is required' });
      return;
    }
    await setJobNimbusApiKey(api_key.trim());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/jobnimbus/disconnect', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await removeJobNimbusApiKey();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
