import { Router } from 'express';
import { getAttendanceRecords, manualCorrection, markAttendanceScan } from '../controllers/attendanceController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.post('/scan', protect, authorize('super_admin', 'admin', 'scanner_operator'), markAttendanceScan);
router.get('/', protect, getAttendanceRecords);
router.post('/manual', protect, authorize('super_admin', 'admin'), manualCorrection);

export default router;
