import { Router } from 'express';
import {
  getScorecardEntries,
  createScorecardEntry,
  updateScorecardEntry,
  deleteScorecardEntry,
} from '../controllers/scorecardController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getScorecardEntries);
router.post('/', authenticate, createScorecardEntry);
router.put('/:id', authenticate, updateScorecardEntry);
router.delete('/:id', authenticate, deleteScorecardEntry);

export default router;
