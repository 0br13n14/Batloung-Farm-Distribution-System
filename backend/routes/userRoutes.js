import { Router } from 'express';
import * as controller from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authenticate, requireRole('admin'));
router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);

export default router;
