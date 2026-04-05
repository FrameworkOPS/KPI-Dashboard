import { Router } from 'express';
import { getTodos, createTodo, updateTodo, deleteTodo } from '../controllers/todosController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, getTodos);
router.post('/', authenticate, createTodo);
router.put('/:id', authenticate, updateTodo);
router.delete('/:id', authenticate, deleteTodo);

export default router;
