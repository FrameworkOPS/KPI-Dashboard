import { Router, Response, NextFunction } from 'express';
import { authenticate, requireAdmin, requireLeadershipOrAdmin } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { getQBOSummary } from '../services/qboService';
import { connect, callback, disconnect, reconnect, status, refreshQBOToken } from '../controllers/qboOAuthController';

const router = Router();

// QuickBooks Online is the only live data integration exposed by this dashboard.
router.get('/qbo', authenticate, requireLeadershipOrAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    try {
      await refreshQBOToken();
    } catch {
      // Non-fatal; getQBOSummary will report a genuinely unusable connection.
    }
    const summary = await getQBOSummary();
    res.json(summary);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('QuickBooks') || error.message.includes('QBO')) {
      res.status(503).json({
        error: 'QuickBooks Online integration is not configured or token expired',
        detail: error.message,
      });
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

export default router;
