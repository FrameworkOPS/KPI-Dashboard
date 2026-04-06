import { Router, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getHubSpotSummary, syncHubSpotToScorecard } from '../services/hubspotService';
import { getQBOSummary } from '../services/qboService';
import { connect, callback, disconnect, reconnect, status, refreshQBOToken } from '../controllers/qboOAuthController';

const router = Router();

router.get('/hubspot', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await getHubSpotSummary();
    res.json(summary);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('HUBSPOT_API_KEY')) {
      res.status(503).json({ error: 'HubSpot integration is not configured', detail: error.message });
      return;
    }
    next(err);
  }
});

router.get('/qbo', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Attempt token refresh if the stored token is expired before fetching summary
    try {
      await refreshQBOToken();
    } catch {
      // Refresh failure is non-fatal here — getQBOSummary will throw its own error
      // if tokens are truly missing or invalid
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

// HubSpot sync → pushes latest data into current week's scorecard entries
router.post('/hubspot/sync', authenticate, requireLeadershipOrAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await syncHubSpotToScorecard();
    res.json({ success: true, message: 'HubSpot data synced to scorecard' });
  } catch (err) {
    next(err);
  }
});

// QBO OAuth — connect/disconnect (admin only for connect, public for callback)
router.get('/qbo/connect', authenticate, requireAdmin, connect);
router.get('/qbo/callback', callback); // public — called by Intuit
router.post('/qbo/disconnect', authenticate, requireAdmin, disconnect);
router.get('/qbo/reconnect', authenticate, requireAdmin, reconnect);
router.get('/qbo/status', authenticate, requireLeadershipOrAdmin, status);

export default router;
