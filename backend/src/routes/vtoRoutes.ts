import { Router } from 'express';
import { getVtoSections, updateVtoSection } from '../controllers/vtoController';
import { authenticate, requireLeadershipOrAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getVtoSections);
router.put('/:section_key', authenticate, requireLeadershipOrAdmin, updateVtoSection);

export default router;
