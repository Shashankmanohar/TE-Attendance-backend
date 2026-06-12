import { Router } from 'express';
import { getBatches, createBatch, updateBatch, deleteBatch } from '../controllers/batchController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.route('/')
  .get(protect, getBatches)
  .post(protect, authorize('super_admin', 'admin'), createBatch);

router.route('/:id')
  .put(protect, authorize('super_admin', 'admin'), updateBatch)
  .delete(protect, authorize('super_admin', 'admin'), deleteBatch);

export default router;
