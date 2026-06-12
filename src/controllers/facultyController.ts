import { Response } from 'express';
import Faculty from '../models/Faculty';
import FacultyAttendance from '../models/FacultyAttendance';
import { AuthRequest } from '../middleware/auth';
import { generateQRCode } from '../utils/qrHelper';
import ActivityLog from '../models/ActivityLog';

// Helper to generate unique Faculty ID: FAC-YYYY-XXXXXX
const getNextFacultyId = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `FAC-${currentYear}-`;

  // Find latest faculty ID for this year
  const latestFaculty = await Faculty.findOne({
    facultyId: new RegExp(`^${prefix}`)
  })
    .sort({ facultyId: -1 })
    .select('facultyId')
    .lean();

  let nextNum = 1;
  if (latestFaculty && latestFaculty.facultyId) {
    const numPart = latestFaculty.facultyId.replace(prefix, '');
    const parsedNum = parseInt(numPart, 10);
    if (!isNaN(parsedNum)) {
      nextNum = parsedNum + 1;
    }
  }

  const zeroPaddedNum = String(nextNum).padStart(6, '0');
  return `${prefix}${zeroPaddedNum}`;
};

// @desc    Get all faculty (with filters & pagination)
// @route   GET /api/faculty
// @access  Private
// @role    super_admin
export const getFaculty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, facultyId, designation, search, page = 1, limit = 50 } = req.query;
    let query: any = {};

    // Filter by branch if relevant
    if (req.user?.role === 'admin' || req.user?.role === 'scanner_operator' || req.user?.role === 'teacher') {
      query.branchId = req.user.branchId;
    }

    if (name) query.name = new RegExp(String(name), 'i');
    if (facultyId) query.facultyId = new RegExp(String(facultyId), 'i');
    if (designation) query.designation = new RegExp(String(designation), 'i');

    if (search) {
      query.$or = [
        { name: new RegExp(String(search), 'i') },
        { facultyId: new RegExp(String(search), 'i') },
        { designation: new RegExp(String(search), 'i') },
        { phoneNumber: new RegExp(String(search), 'i') }
      ];
    }

    const pg = parseInt(String(page), 10);
    const lim = parseInt(String(limit), 10);
    const skip = (pg - 1) * lim;

    const facultyMembers = await Faculty.find(query)
      .populate('branchId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim);

    const total = await Faculty.countDocuments(query);

    res.status(200).json({
      success: true,
      count: facultyMembers.length,
      total,
      pages: Math.ceil(total / lim),
      currentPage: pg,
      data: facultyMembers
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single faculty details by facultyId
// @route   GET /api/faculty/code/:facultyId
// @access  Private
export const getFacultyByFacultyId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const faculty = await Faculty.findOne({ facultyId: req.params.facultyId })
      .populate('branchId', 'name');

    if (!faculty) {
      res.status(404).json({ success: false, message: 'Faculty member not found' });
      return;
    }

    const facultyBranchId = faculty.branchId
      ? (typeof faculty.branchId === 'object' && '_id' in (faculty.branchId as any)
        ? (faculty.branchId as any)._id?.toString()
        : faculty.branchId.toString())
      : null;
    const userBranchId = req.user?.branchId?.toString() || null;

    if (req.user?.role !== 'super_admin' && facultyBranchId !== userBranchId) {
      res.status(403).json({ success: false, message: 'Unauthorized to view faculty from other branch' });
      return;
    }

    res.status(200).json({ success: true, data: faculty });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new faculty member
// @route   POST /api/faculty
// @access  Private (Super Admin & Admin)
export const createFaculty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, designation, phoneNumber, email, address, branchId } = req.body;

    let targetBranchId = branchId || null;
    if (req.user?.role === 'admin') {
      targetBranchId = req.user.branchId || null;
    }

    // Generate unique Faculty ID
    const facultyId = await getNextFacultyId();

    // Generate QR code base64 containing only facultyId
    const qrCodeData = await generateQRCode(facultyId);

    // Retrieve uploaded photo URL if exists
    let photoUrl = '';
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const faculty = await Faculty.create({
      facultyId,
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
      action: 'ADD_FACULTY',
      details: `Added faculty ${name} with ID ${facultyId}`
    });

    res.status(201).json({ success: true, data: faculty });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update faculty details
// @route   PUT /api/faculty/:id
// @access  Private (Super Admin & Admin)
export const updateFaculty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, designation, phoneNumber, email, address, branchId, active } = req.body;

    let faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      res.status(404).json({ success: false, message: 'Faculty member not found' });
      return;
    }

    // Role checks
    if (req.user?.role === 'admin' && faculty.branchId && faculty.branchId.toString() !== req.user.branchId?.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to update faculty in another branch' });
      return;
    }

    faculty.name = name || faculty.name;
    faculty.designation = designation || faculty.designation;
    faculty.phoneNumber = phoneNumber || faculty.phoneNumber;
    faculty.email = email !== undefined ? email : faculty.email;
    faculty.address = address || faculty.address;
    if (active !== undefined) faculty.active = active;

    if (req.user?.role === 'super_admin' && branchId) {
      faculty.branchId = branchId;
    }

    if (req.file) {
      faculty.photoUrl = `/uploads/${req.file.filename}`;
    }

    await faculty.save();

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'UPDATE_FACULTY',
      details: `Updated faculty ${faculty.name} (${faculty.facultyId})`
    });

    res.status(200).json({ success: true, data: faculty });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete faculty
// @route   DELETE /api/faculty/:id
// @access  Private (Super Admin & Admin)
export const deleteFaculty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const faculty = await Faculty.findById(req.params.id);
    if (!faculty) {
      res.status(404).json({ success: false, message: 'Faculty member not found' });
      return;
    }

    // Role checks
    if (req.user?.role === 'admin' && faculty.branchId && faculty.branchId.toString() !== req.user.branchId?.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to delete faculty in another branch' });
      return;
    }

    await Faculty.findByIdAndDelete(req.params.id);

    // Delete associated attendance records
    if (faculty.facultyId) {
      await FacultyAttendance.deleteMany({ facultyId: faculty.facultyId });
    }

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'DELETE_FACULTY',
      details: `Deleted faculty ${faculty.name} (${faculty.facultyId})`
    });

    res.status(200).json({ success: true, message: 'Faculty member deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
