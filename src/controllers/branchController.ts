import { Response } from 'express';
import Branch from '../models/Branch';
import { AuthRequest } from '../middleware/auth';

// @desc    Get all branches
// @route   GET /api/branches
// @access  Public (for initial setup/login/register screen) / Private
export const getBranches = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const branches = await Branch.find();
    res.status(200).json({ success: true, count: branches.length, data: branches });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new branch
// @route   POST /api/branches
// @access  Private (Super Admin only)
export const createBranch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, address } = req.body;

  try {
    const branch = await Branch.create({ name, address });
    res.status(201).json({ success: true, data: branch });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update branch details
// @route   PUT /api/branches/:id
// @access  Private (Super Admin only)
export const updateBranch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, address, active } = req.body;

  try {
    let branch = await Branch.findById(req.params.id);

    if (!branch) {
      res.status(404).json({ success: false, message: 'Branch not found' });
      return;
    }

    branch.name = name || branch.name;
    branch.address = address || branch.address;
    if (active !== undefined) branch.active = active;

    await branch.save();
    res.status(200).json({ success: true, data: branch });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private (Super Admin only)
export const deleteBranch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      res.status(404).json({ success: false, message: 'Branch not found' });
      return;
    }

    await Branch.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Branch deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
