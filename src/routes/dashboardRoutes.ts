import { Router } from 'express';
import { getCharts, getMetrics, getActivityLogs } from '../controllers/dashboardController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.get('/metrics', protect, getMetrics);
router.get('/charts', protect, getCharts);
router.get('/logs', protect, authorize('super_admin', 'admin'), getActivityLogs);

export default router;
