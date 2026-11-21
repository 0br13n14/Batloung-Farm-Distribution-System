import { Router } from 'express';
import * as controller from '../controllers/reportController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'sales'));
router.get('/top-fruits', controller.topFruits);
router.get('/revenue', controller.revenue);
router.get('/top-vendor', controller.topVendor);
router.get('/stock-levels', controller.stockLevels);

export default router;
