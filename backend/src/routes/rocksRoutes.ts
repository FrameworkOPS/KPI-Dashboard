import { Router } from 'express';
import { getRocks, createRock, updateRock, deleteRock } from '../controllers/rocksController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getRocks);
router.post('/', authenticate, createRock);
router.put('/:id', authenticate, updateRock);
router.delete('/:id', authenticate, deleteRock);

export default router;
