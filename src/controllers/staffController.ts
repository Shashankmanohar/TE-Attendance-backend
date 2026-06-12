import { Response } from 'express';
import Staff from '../models/Staff';
import StaffAttendance from '../models/StaffAttendance';
import { AuthRequest } from '../middleware/auth';
import { generateQRCode } from '../utils/qrHelper';
import ActivityLog from '../models/ActivityLog';
import { uploadToCloudinary } from '../utils/cloudinary';

// Helper to generate unique Staff ID: STF-YYYY-XXXXXX
const getNextStaffId = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `STF-${currentYear}-`;

  // Find latest staff ID for this year
  const latestStaff = await Staff.findOne({
    staffId: new RegExp(`^${prefix}`)
  })
    .sort({ staffId: -1 })
    .select('staffId')
    .lean();

  let nextNum = 1;
  if (latestStaff && latestStaff.staffId) {
    const numPart = latestStaff.staffId.replace(prefix, '');
    const parsedNum = parseInt(numPart, 10);
    if (!isNaN(parsedNum)) {
      nextNum = parsedNum + 1;
    }
  }

  const zeroPaddedNum = String(nextNum).padStart(6, '0');
  return `${prefix}${zeroPaddedNum}`;
};

// @desc    Get all staff (with filters & pagination)
// @route   GET /api/staff
// @access  Private
// @role    super_admin
export const getStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, staffId, designation, search, page = 1, limit = 50 } = req.query;
    let query: any = {};

    // Filter by branch if relevant
    if (req.user?.role === 'admin' || req.user?.role === 'scanner_operator' || req.user?.role === 'teacher') {
      query.branchId = req.user.branchId;
    }

    if (name) query.name = new RegExp(String(name), 'i');
    if (staffId) query.staffId = new RegExp(String(staffId), 'i');
    if (designation) query.designation = new RegExp(String(designation), 'i');

    if (search) {
      query.$or = [
        { name: new RegExp(String(search), 'i') },
        { staffId: new RegExp(String(search), 'i') },
        { designation: new RegExp(String(search), 'i') },
        { phoneNumber: new RegExp(String(search), 'i') }
      ];
    }

    const pg = parseInt(String(page), 10);
    const lim = parseInt(String(limit), 10);
    const skip = (pg - 1) * lim;

    const staffMembers = await Staff.find(query)
      .populate('branchId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim);

    const total = await Staff.countDocuments(query);

    res.status(200).json({
      success: true,
      count: staffMembers.length,
      total,
      pages: Math.ceil(total / lim),
      currentPage: pg,
      data: staffMembers
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single staff details by staffId
// @route   GET /api/staff/code/:staffId
// @access  Private
export const getStaffByStaffId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staff = await Staff.findOne({ staffId: req.params.staffId })
      .populate('branchId', 'name');

    if (!staff) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    const staffBranchId = staff.branchId
      ? (typeof staff.branchId === 'object' && '_id' in (staff.branchId as any)
        ? (staff.branchId as any)._id?.toString()
        : staff.branchId.toString())
      : null;
    const userBranchId = req.user?.branchId?.toString() || null;

    if (req.user?.role !== 'super_admin' && staffBranchId !== userBranchId) {
      res.status(403).json({ success: false, message: 'Unauthorized to view staff from other branch' });
      return;
    }

    res.status(200).json({ success: true, data: staff });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new staff member
// @route   POST /api/staff
// @access  Private (Super Admin & Admin)
export const createStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, designation, phoneNumber, email, address, branchId } = req.body;

    let targetBranchId = branchId || null;
    if (req.user?.role === 'admin') {
      targetBranchId = req.user.branchId || null;
    }

    // Generate unique Staff ID
    const staffId = await getNextStaffId();

    // Generate QR code base64 containing only staffId
    const qrCodeData = await generateQRCode(staffId);

    // Retrieve uploaded photo URL if exists
    let photoUrl = '';
    if (req.file) {
      photoUrl = await uploadToCloudinary(req.file.path, 'staff');
      if (!photoUrl) {
        photoUrl = `/uploads/${req.file.filename}`;
      }
    }

    const staff = await Staff.create({
      staffId,
      name,
      designation,
      phoneNumber,
      email,
      address,
      branchId: targetBranchId,
      qrCodeData,
      photoUrl
    });

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'ADD_STAFF',
      details: `Added staff ${name} with ID ${staffId}`
    });

    res.status(201).json({ success: true, data: staff });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update staff details
// @route   PUT /api/staff/:id
// @access  Private (Super Admin & Admin)
export const updateStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, designation, phoneNumber, email, address, branchId, active } = req.body;

    let staff = await Staff.findById(req.params.id);
    if (!staff) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    // Role checks
    if (req.user?.role === 'admin' && staff.branchId && staff.branchId.toString() !== req.user.branchId?.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to update staff in another branch' });
      return;
    }

    staff.name = name || staff.name;
    staff.designation = designation || staff.designation;
    staff.phoneNumber = phoneNumber || staff.phoneNumber;
    staff.email = email !== undefined ? email : staff.email;
    staff.address = address || staff.address;
    if (active !== undefined) staff.active = active;

    if (req.user?.role === 'super_admin' && branchId) {
      staff.branchId = branchId;
    }

    if (req.file) {
      const uploadedUrl = await uploadToCloudinary(req.file.path, 'staff');
      staff.photoUrl = uploadedUrl || `/uploads/${req.file.filename}`;
    }

    await staff.save();

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'UPDATE_STAFF',
      details: `Updated staff ${staff.name} (${staff.staffId})`
    });

    res.status(200).json({ success: true, data: staff });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete staff
// @route   DELETE /api/staff/:id
// @access  Private (Super Admin & Admin)
export const deleteStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      res.status(404).json({ success: false, message: 'Staff member not found' });
      return;
    }

    // Role checks
    if (req.user?.role === 'admin' && staff.branchId && staff.branchId.toString() !== req.user.branchId?.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to delete staff in another branch' });
      return;
    }

    await Staff.findByIdAndDelete(req.params.id);

    // Delete associated attendance records
    if (staff.staffId) {
      await StaffAttendance.deleteMany({ staffId: staff.staffId });
    }

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'DELETE_STAFF',
      details: `Deleted staff ${staff.name} (${staff.staffId})`
    });

    res.status(200).json({ success: true, message: 'Staff member deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
