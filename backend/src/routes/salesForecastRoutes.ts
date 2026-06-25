import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getSalesForecasts, createOrUpdateSalesForecast } from '../controllers/salesForecastController';

const router = Router();
router.get('/',  authenticate, getSalesForecasts);
router.post('/', authenticate, createOrUpdateSalesForecast);
export default router;
