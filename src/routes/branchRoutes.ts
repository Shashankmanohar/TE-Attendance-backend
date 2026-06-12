import { Router } from 'express';
import { getBranches, createBranch, updateBranch, deleteBranch } from '../controllers/branchController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

// Allow public access to GET branches for registration / select branch UI
router.route('/')
  .get(getBranches)
  .post(protect, authorize('super_admin'), createBranch);

router.route('/:id')
  .put(protect, authorize('super_admin'), updateBranch)
  .delete(protect, authorize('super_admin'), deleteBranch);

export default router;
