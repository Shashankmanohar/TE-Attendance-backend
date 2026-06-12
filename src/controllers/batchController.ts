import { Response } from 'express';
import Batch from '../models/Batch';
import { AuthRequest } from '../middleware/auth';

// @desc    Get all batches
// @route   GET /api/batches
// @access  Private
export const getBatches = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let query: any = {};

    // Filter by branch for normal Admins
    if (req.user?.role === 'admin') {
      query.branchId = req.user.branchId;
    }

    const batches = await Batch.find(query)
      .populate('branchId', 'name');

    res.status(200).json({ success: true, count: batches.length, data: batches });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new batch
// @route   POST /api/batches
// @access  Private (Super Admin & Admin)
export const createBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, class: classLvl, course, subject, timings, branchId } = req.body;
  try {
    let targetBranchId = branchId || null;
    if (req.user?.role === 'admin') {
      targetBranchId = req.user.branchId || null;
    }

    const batch = await Batch.create({
      name,
      class: classLvl,
      course,
      subject,
      timings,
      branchId: targetBranchId
    });

    res.status(201).json({ success: true, data: batch });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update batch
// @route   PUT /api/batches/:id
// @access  Private (Super Admin & Admin)
export const updateBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, class: classLvl, course, subject, timings, branchId } = req.body;

  try {
    let batch = await Batch.findById(req.params.id);

    if (!batch) {
      res.status(404).json({ success: false, message: 'Batch not found' });
      return;
    }

    // Role verification
    const batchBranchIdStr = batch.branchId ? batch.branchId.toString() : null;
    const userBranchIdStr = req.user?.branchId ? req.user.branchId.toString() : null;
    if (req.user?.role === 'admin' && batchBranchIdStr !== userBranchIdStr) {
      res.status(403).json({ success: false, message: 'Not authorized to edit this branch batch' });
      return;
    }

    batch.name = name || batch.name;
    batch.class = classLvl || batch.class;
    batch.course = course || batch.course;
    batch.subject = subject || batch.subject;
    batch.timings = timings || batch.timings;
    if (req.user?.role === 'super_admin') {
      batch.branchId = branchId || batch.branchId;
    }

    await batch.save();
    res.status(200).json({ success: true, data: batch });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete batch
// @route   DELETE /api/batches/:id
// @access  Private (Super Admin & Admin)
export const deleteBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const batch = await Batch.findById(req.params.id);

    if (!batch) {
      res.status(404).json({ success: false, message: 'Batch not found' });
      return;
    }

    // Role verification
    const batchBranchIdStr = batch.branchId ? batch.branchId.toString() : null;
    const userBranchIdStr = req.user?.branchId ? req.user.branchId.toString() : null;
    if (req.user?.role === 'admin' && batchBranchIdStr !== userBranchIdStr) {
      res.status(403).json({ success: false, message: 'Not authorized to delete this branch batch' });
      return;
    }

    await Batch.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Batch deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
