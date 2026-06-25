import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getPipelineItems, createPipelineItem, updatePipelineItem, deletePipelineItem, getPipelineSummary } from '../controllers/pipelineController';

const router = Router();
router.get('/summary', authenticate, getPipelineSummary);
router.get('/',        authenticate, getPipelineItems);
router.post('/',       authenticate, createPipelineItem);
router.put('/:id',     authenticate, updatePipelineItem);
router.delete('/:id',  authenticate, deletePipelineItem);
export default router;
