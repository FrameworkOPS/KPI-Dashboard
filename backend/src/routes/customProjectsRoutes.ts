import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getCustomProjects, createCustomProject, updateCustomProject, deleteCustomProject } from '../controllers/customProjectsController';

const router = Router();
router.get('/',    authenticate, getCustomProjects);
router.post('/',   authenticate, createCustomProject);
router.put('/:id', authenticate, updateCustomProject);
router.delete('/:id', authenticate, deleteCustomProject);
export default router;
