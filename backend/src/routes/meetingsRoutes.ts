import { Router } from 'express';
import { getMeetings, createMeeting, updateMeeting, deleteMeeting } from '../controllers/meetingsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getMeetings);
router.post('/', authenticate, createMeeting);
router.put('/:id', authenticate, updateMeeting);
router.delete('/:id', authenticate, deleteMeeting);

export default router;
