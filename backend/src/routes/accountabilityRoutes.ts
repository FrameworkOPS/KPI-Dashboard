import { Router } from 'express';
import {
  getAccountabilityChart,
  createSeat,
  updateSeat,
  deleteSeat,
} from '../controllers/accountabilityController';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getAccountabilityChart);
router.post('/', authenticate, requireLeadershipOrAdmin, createSeat);
router.put('/:id', authenticate, requireLeadershipOrAdmin, updateSeat);
router.delete('/:id', authenticate, requireLeadershipOrAdmin, deleteSeat);

export default router;
