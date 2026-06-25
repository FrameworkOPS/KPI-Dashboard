import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getCrewStaff, getCrewStaffByCrew, upsertCrewStaff } from '../controllers/crewStaffController';

const router = Router();
router.get('/crew/:crewId', authenticate, getCrewStaffByCrew);
router.get('/',  authenticate, getCrewStaff);
router.post('/', authenticate, upsertCrewStaff);
export default router;
