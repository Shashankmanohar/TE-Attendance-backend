import { Router } from 'express';
import { login, getMe, createUser, getUsers, updateUser, deleteUser } from '../controllers/authController';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.get('/me', protect, getMe);

// Staff management (Admins & Super Admins)
router.route('/users')
  .post(protect, authorize('super_admin', 'admin'), createUser)
  .get(protect, authorize('super_admin', 'admin'), getUsers);

router.route('/users/:id')
  .put(protect, authorize('super_admin', 'admin'), updateUser)
  .delete(protect, authorize('super_admin'), deleteUser);

export default router;
