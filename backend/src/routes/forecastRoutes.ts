import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getSixMonthForecast } from '../controllers/forecastController';

const router = Router();
router.get('/six-month', authenticate, getSixMonthForecast);
export default router;
