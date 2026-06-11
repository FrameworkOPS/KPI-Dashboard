import { Router } from 'express';
import {
  getMeetings, createMeeting, updateMeeting, deleteMeeting, exportIcs, sendReminder,
  startMeeting, advanceStage, completeMeeting, getMeetingStages,
} from '../controllers/meetingsController';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/',                authenticate, getMeetings);
router.post('/',               authenticate, createMeeting);
router.put('/:id',             authenticate, updateMeeting);
router.delete('/:id',          authenticate, deleteMeeting);
router.get('/:id/ics',         authenticate, exportIcs);
router.post('/:id/reminder',   authenticate, requireLeadershipOrAdmin, sendReminder);

// Meeting runner
router.get('/:id/stages',      authenticate, getMeetingStages);
router.post('/:id/start',      authenticate, startMeeting);
router.post('/:id/advance',    authenticate, advanceStage);
router.post('/:id/complete',   authenticate, completeMeeting);

export default router;
