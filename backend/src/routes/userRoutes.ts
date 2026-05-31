import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, resendInvite } from '../controllers/userController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/',     authenticate, requireAdmin, getUsers);
router.post('/',    authenticate, requireAdmin, createUser);
router.post('/:id/resend-invite', authenticate, requireAdmin, resendInvite);
router.put('/:id',  authenticate, requireAdmin, updateUser);
router.delete('/:id', authenticate, requireAdmin, deleteUser);

export default router;
