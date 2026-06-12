import { Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import ActivityLog from '../models/ActivityLog';

const generateToken = (id: string): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'qr_attendance_jwt_secret_key_9988', {
    expiresIn: (process.env.JWT_EXPIRE || '30d') as any
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Please provide an email and password' });
    return;
  }

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }

    const token = generateToken(user._id.toString());

    // Log the login action
    await ActivityLog.create({
      userId: user._id,
      action: 'LOGIN',
      details: `User logged in from IP ${req.ip}`
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        branchId: user.branchId
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id).populate('branchId', 'name');
    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new user (Staff)
// @route   POST /api/auth/users
// @access  Private (Super Admin & Admin)
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, email, password, role, branchId } = req.body;

  try {
    // Check if email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400).json({ success: false, message: 'User already exists with this email' });
      return;
    }

    // Role-based verification: Admins can only create scanner operators and teachers for their own branch
    if (req.user?.role === 'admin') {
      if (role === 'super_admin' || role === 'admin') {
        res.status(403).json({ success: false, message: 'Admins cannot create Super Admins or Admins' });
        return;
      }
      if (branchId !== req.user.branchId?.toString()) {
        res.status(403).json({ success: false, message: 'Admins can only create staff for their own branch' });
        return;
      }
    }

    const newUser = await User.create({
      name,
      email,
      password,
      role,
      branchId: role === 'super_admin' ? null : branchId
    });

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'CREATE_USER',
      details: `Created new staff user: ${name} (${role})`
    });

    res.status(201).json({
      success: true,
      message: 'Staff user created successfully',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        branchId: newUser.branchId
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all users (Staff)
// @route   GET /api/auth/users
// @access  Private (Super Admin & Admin)
export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let query: any = {};

    // Admin can only see users of their own branch
    if (req.user?.role === 'admin') {
      query.branchId = req.user.branchId;
    }

    const users = await User.find(query).populate('branchId', 'name');
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user status / details
// @route   PUT /api/auth/users/:id
// @access  Private (Super Admin & Admin)
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, email, role, branchId, active, password } = req.body;

  try {
    let user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Authorization checks
    if (req.user?.role === 'admin') {
      if (user.role === 'super_admin' || user.role === 'admin') {
        res.status(403).json({ success: false, message: 'Admins cannot update Super Admins or Admins' });
        return;
      }
      if (user.branchId?.toString() !== req.user.branchId?.toString()) {
        res.status(403).json({ success: false, message: 'Admins can only update staff from their own branch' });
        return;
      }
    }

    user.name = name || user.name;
    user.email = email || user.email;
    user.role = role || user.role;
    user.branchId = role === 'super_admin' ? null : (branchId || user.branchId);
    if (active !== undefined) user.active = active;
    if (password) user.password = password; // Trigger pre-save hook for password hash

    await user.save();

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'UPDATE_USER',
      details: `Updated staff user: ${user.name} (${user.role})`
    });

    res.status(200).json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a user
// @route   DELETE /api/auth/users/:id
// @access  Private (Super Admin only)
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.role === 'super_admin') {
      res.status(400).json({ success: false, message: 'Cannot delete Super Admin account' });
      return;
    }

    await User.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'DELETE_USER',
      details: `Deleted user account: ${user.name} (${user.email})`
    });

    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
