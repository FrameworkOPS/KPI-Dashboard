import { Router, Response, NextFunction } from 'express';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getHubSpotSummary } from '../services/hubspotService';
import { getQBOSummary } from '../services/qboService';

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

export default router;
