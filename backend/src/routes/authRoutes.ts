import { Router } from 'express';
import {
  login,
  getMe,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getInvite,
  acceptInvite,
} from '../controllers/authController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Public
router.post('/login', login);
router.get('/invite/:token', getInvite);
router.post('/accept-invite', acceptInvite);

// Authenticated
router.get('/me', authenticate, getMe);

// Admin only
router.get('/users', authenticate, requireAdmin, getUsers);
router.post('/users', authenticate, requireAdmin, createUser);
router.put('/users/:id', authenticate, requireAdmin, updateUser);
router.delete('/users/:id', authenticate, requireAdmin, deleteUser);

export default router;
