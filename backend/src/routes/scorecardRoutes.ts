import { Router } from 'express';
import {
  getScorecardEntries,
  getScorecardHistory,
  createScorecardEntry,
  updateScorecardEntry,
  deleteScorecardEntry,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  reorderTemplates,
  createWeekFromTemplate,
} from '../controllers/scorecardController';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/templates', authenticate, getTemplates);
// Editing which metrics a scorecard has is a leadership/admin decision.
router.post('/templates', authenticate, requireLeadershipOrAdmin, createTemplate);
router.put('/templates/reorder', authenticate, requireLeadershipOrAdmin, reorderTemplates);
router.put('/templates/:id', authenticate, requireLeadershipOrAdmin, updateTemplate);
router.delete('/templates/:id', authenticate, requireLeadershipOrAdmin, deleteTemplate);
router.get('/history', authenticate, getScorecardHistory);
router.post('/new-week', authenticate, requireLeadershipOrAdmin, createWeekFromTemplate);
router.get('/', authenticate, getScorecardEntries);
router.post('/', authenticate, createScorecardEntry);
router.put('/:id', authenticate, updateScorecardEntry);
router.delete('/:id', authenticate, deleteScorecardEntry);

export default router;
