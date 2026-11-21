import { Router } from 'express';
import * as controller from '../controllers/saleController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'sales'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:saleId/payment', controller.addPayment);

export default router;
