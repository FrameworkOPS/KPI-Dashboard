import { Router } from 'express';
import { getMeetings, createMeeting, updateMeeting, deleteMeeting, sendReminder } from '../controllers/meetingsController';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/',                authenticate, getMeetings);
router.post('/',               authenticate, createMeeting);
router.put('/:id',             authenticate, updateMeeting);
router.delete('/:id',          authenticate, deleteMeeting);
router.post('/:id/reminder',   authenticate, requireLeadershipOrAdmin, sendReminder);

export default router;
