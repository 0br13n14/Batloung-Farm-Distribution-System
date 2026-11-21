import { Router } from 'express';
import * as controller from '../controllers/purchaseController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authenticate, requireRole('admin'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);

export default router;
