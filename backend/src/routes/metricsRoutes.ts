import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMetricsDashboard } from '../controllers/metricsController';

const router = Router();
router.get('/dashboard', authenticate, getMetricsDashboard);
export default router;
