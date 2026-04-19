import { Router } from 'express';
import {
  getScorecardEntries,
  getScorecardHistory,
  createScorecardEntry,
  updateScorecardEntry,
  deleteScorecardEntry,
  getTemplates,
  createWeekFromTemplate,
} from '../controllers/scorecardController';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/templates', authenticate, getTemplates);
router.get('/history', authenticate, getScorecardHistory);
router.post('/new-week', authenticate, requireLeadershipOrAdmin, createWeekFromTemplate);
router.get('/', authenticate, getScorecardEntries);
router.post('/', authenticate, createScorecardEntry);
router.put('/:id', authenticate, updateScorecardEntry);
router.delete('/:id', authenticate, deleteScorecardEntry);

export default router;
