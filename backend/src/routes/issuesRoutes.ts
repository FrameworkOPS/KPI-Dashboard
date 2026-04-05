import { Router } from 'express';
import { getIssues, createIssue, updateIssue, deleteIssue } from '../controllers/issuesController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getIssues);
router.post('/', authenticate, createIssue);
router.put('/:id', authenticate, updateIssue);
router.delete('/:id', authenticate, deleteIssue);

export default router;
