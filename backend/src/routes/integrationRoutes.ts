import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getQBOSummary } from '../services/qboService';
import { connect, callback, disconnect, reconnect, status, refreshQBOToken } from '../controllers/qboOAuthController';
import {
  isJobNimbusConfigured,
  getOrCreateWebhookToken,
  regenerateWebhookToken,
  removeWebhookToken,
  getWebhookToken,
  upsertJobFromWebhook,
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

// ── JobNimbus (Zapier webhook model) ──────────────────────────────────────────

// Status + webhook URL — admin/leadership can view
router.get('/jobnimbus/status', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getWebhookToken();
    const configured = !!token;
    const appUrl = process.env.APP_URL || '';
    const webhookUrl = token ? `${appUrl}/api/integrations/jobnimbus/webhook?token=${token}` : null;
    res.json({ connected: configured, webhook_url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

// Summary from DB (data pushed by Zapier)
router.get('/jobnimbus', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const configured = await isJobNimbusConfigured();
    if (!configured) {
      res.status(503).json({ error: 'JobNimbus webhook not configured' });
      return;
    }
    const summary = await getJobNimbusSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Generate / return webhook URL — admin only
router.post('/jobnimbus/configure', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getOrCreateWebhookToken();
    const appUrl = process.env.APP_URL || '';
    const webhookUrl = `${appUrl}/api/integrations/jobnimbus/webhook?token=${token}`;
    res.json({ webhook_url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

// Regenerate token (invalidates the old Zapier webhook URL)
router.post('/jobnimbus/regenerate', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await regenerateWebhookToken();
    const appUrl = process.env.APP_URL || '';
    const webhookUrl = `${appUrl}/api/integrations/jobnimbus/webhook?token=${token}`;
    res.json({ webhook_url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

// Disconnect — removes token + clears job data
router.post('/jobnimbus/disconnect', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await removeWebhookToken();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Public webhook endpoint — called by Zapier (no auth, validated by token query param)
router.post('/jobnimbus/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.query as { token?: string };
    if (!token) {
      res.status(401).json({ error: 'Missing token' });
      return;
    }

    const storedToken = await getWebhookToken();
    if (!storedToken || token !== storedToken) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const body = req.body;
    // Zapier can send a single object or an array
    const jobs = Array.isArray(body) ? body : [body];

    let saved = 0;
    for (const job of jobs) {
      if (job && (job.id || job.jnid)) {
        await upsertJobFromWebhook(job);
        saved++;
      }
    }

    res.json({ received: true, saved });
  } catch (err) {
    next(err);
  }
});

export default router;
