import { Router } from 'express';
import { getIssues, createIssue, updateIssue, deleteIssue, voteIssue, unvoteIssue } from '../controllers/issuesController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getIssues);
router.post('/', authenticate, createIssue);
router.put('/:id', authenticate, updateIssue);
router.delete('/:id', authenticate, deleteIssue);
router.post('/:id/vote', authenticate, voteIssue);
router.delete('/:id/vote', authenticate, unvoteIssue);

export default router;
