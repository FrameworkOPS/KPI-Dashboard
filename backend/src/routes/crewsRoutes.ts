import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getCrews, getCrew, createCrew, updateCrew, deleteCrew } from '../controllers/crewsController';

const router = Router();
router.get('/',    authenticate, getCrews);
router.get('/:id', authenticate, getCrew);
router.post('/',   authenticate, createCrew);
router.put('/:id', authenticate, updateCrew);
router.delete('/:id', authenticate, deleteCrew);
export default router;
