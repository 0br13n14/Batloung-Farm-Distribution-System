import { Router } from 'express';
import * as controller from '../controllers/fruitStockController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
router.get('/fruits', authenticate, controller.listFruits);
router.post('/fruits', authenticate, requireRole('admin'), controller.createFruit);
router.patch('/fruits/:id', authenticate, requireRole('admin'), controller.updateFruit);
router.delete('/fruits/:id', authenticate, requireRole('admin'), controller.deleteFruit);
router.get('/stock', authenticate, controller.listStock);
router.patch('/stock/:stockId', authenticate, requireRole('admin'), controller.updateStock);
router.delete('/stock/:stockId', authenticate, requireRole('admin'), controller.deleteStock);

export default router;
