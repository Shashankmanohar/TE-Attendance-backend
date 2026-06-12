import { Response } from 'express';
import Student from '../models/Student';
import Batch from '../models/Batch';
import Attendance from '../models/Attendance';
import { AuthRequest } from '../middleware/auth';
import { generateQRCode } from '../utils/qrHelper';
import ActivityLog from '../models/ActivityLog';
import { uploadToCloudinary } from '../utils/cloudinary';

// Helper to generate unique Student ID: STU-YYYY-XXXXXX
const getNextStudentId = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const prefix = `STU-${currentYear}-`;

  // Find latest student ID for this year
  const latestStudent = await Student.findOne({
    studentId: new RegExp(`^${prefix}`)
  })
    .sort({ studentId: -1 })
    .select('studentId')
    .lean();

  let nextNum = 1;
  if (latestStudent && latestStudent.studentId) {
    const numPart = latestStudent.studentId.replace(prefix, '');
    const parsedNum = parseInt(numPart, 10);
    if (!isNaN(parsedNum)) {
      nextNum = parsedNum + 1;
    }
  }

  // Format as STU-YYYY-000001
  const zeroPaddedNum = String(nextNum).padStart(6, '0');
  return `${prefix}${zeroPaddedNum}`;
};

// @desc    Get all students (with filters & pagination)
// @route   GET /api/students
// @access  Private
export const getStudents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, studentId, classLvl, course, batchId, search, page = 1, limit = 50 } = req.query;
    let query: any = {};

    // Filter by branch
    if (req.user?.role === 'admin' || req.user?.role === 'scanner_operator' || req.user?.role === 'teacher') {
      query.branchId = req.user.branchId;
    }

    if (name) query.name = new RegExp(String(name), 'i');
    if (studentId) query.studentId = new RegExp(String(studentId), 'i');
    if (classLvl) query.class = classLvl;
    if (course) query.course = course;
    if (batchId) query.batchId = batchId;

    if (search) {
      query.$or = [
        { name: new RegExp(String(search), 'i') },
        { studentId: new RegExp(String(search), 'i') },
        { rollNumber: new RegExp(String(search), 'i') },
        { phoneNumber: new RegExp(String(search), 'i') }
      ];
    }

    const pg = parseInt(String(page), 10);
    const lim = parseInt(String(limit), 10);
    const skip = (pg - 1) * lim;

    const students = await Student.find(query)
      .populate('batchId', 'name timings')
      .populate('branchId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim);

    const total = await Student.countDocuments(query);

    res.status(200).json({
      success: true,
      count: students.length,
      total,
      pages: Math.ceil(total / lim),
      currentPage: pg,
      data: students
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single student details by studentId
// @route   GET /api/students/:studentId
// @access  Private
export const getStudentByStudentId = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId })
      .populate('batchId', 'name timings subject')
      .populate('branchId', 'name');

    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    // Role check
    const studentBranchId = student.branchId
      ? (typeof student.branchId === 'object' && '_id' in (student.branchId as any)
        ? (student.branchId as any)._id?.toString()
        : student.branchId.toString())
      : null;
    const userBranchId = req.user?.branchId?.toString() || null;

    if (req.user?.role !== 'super_admin' && studentBranchId !== userBranchId) {
      res.status(403).json({ success: false, message: 'Unauthorized to view student from other branch' });
      return;
    }

    res.status(200).json({ success: true, data: student });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new student
// @route   POST /api/students
// @access  Private (Super Admin & Admin)
export const createStudent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, rollNumber, phoneNumber, parentPhoneNumber, email, address, classLvl, course, batchId, branchId } = req.body;

    let targetBranchId = branchId || null;
    if (req.user?.role === 'admin') {
      targetBranchId = req.user.branchId || null;
    }

    // Verify batch exists
    const batch = await Batch.findById(batchId);
    if (!batch) {
      res.status(400).json({ success: false, message: 'Invalid Batch assigned' });
      return;
    }

    // Check if roll number already exists inside the branch
    const rollExists = await Student.findOne({ rollNumber, branchId: targetBranchId });
    if (rollExists) {
      res.status(400).json({ success: false, message: `Roll number '${rollNumber}' already exists in this branch` });
      return;
    }

    // Generate unique Student ID
    const studentId = await getNextStudentId();

    // Generate QR code base64 containing only studentId
    const qrCodeData = await generateQRCode(studentId);

    // Retrieve uploaded photo URL if exists
    let photoUrl = '';
    if (req.file) {
      photoUrl = await uploadToCloudinary(req.file.path, 'students');
      if (!photoUrl) {
        photoUrl = `/uploads/${req.file.filename}`;
      }
    }

    const student = await Student.create({
      studentId,
      name,
      rollNumber,
      phoneNumber,
      parentPhoneNumber,
      email,
      address,
      class: classLvl,
      course,
      batchId,
      branchId: targetBranchId,
      qrCodeData,
      photoUrl
    });

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'ADD_STUDENT',
      details: `Added student ${name} with ID ${studentId}`
    });

    res.status(201).json({ success: true, data: student });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update student details
// @route   PUT /api/students/:id
// @access  Private (Super Admin & Admin)
export const updateStudent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, rollNumber, phoneNumber, parentPhoneNumber, email, address, classLvl, course, batchId, branchId, active } = req.body;

    let student = await Student.findById(req.params.id);
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    // Role checks
    if (req.user?.role === 'admin' && student.branchId && student.branchId.toString() !== req.user.branchId?.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to update student in another branch' });
      return;
    }

    // Roll number change validation
    if (rollNumber && rollNumber !== student.rollNumber) {
      const rollExists = await Student.findOne({
        rollNumber,
        branchId: student.branchId,
        _id: { $ne: student._id }
      });
      if (rollExists) {
        res.status(400).json({ success: false, message: `Roll number '${rollNumber}' already exists in this branch` });
        return;
      }
      student.rollNumber = rollNumber;
    }

    student.name = name || student.name;
    student.phoneNumber = phoneNumber || student.phoneNumber;
    student.parentPhoneNumber = parentPhoneNumber || student.parentPhoneNumber;
    student.email = email !== undefined ? email : student.email;
    student.address = address || student.address;
    student.class = classLvl || student.class;
    student.course = course || student.course;
    student.batchId = batchId || student.batchId;
    if (active !== undefined) student.active = active;

    if (req.user?.role === 'super_admin' && branchId) {
      student.branchId = branchId;
    }

    if (req.file) {
      const uploadedUrl = await uploadToCloudinary(req.file.path, 'students');
      student.photoUrl = uploadedUrl || `/uploads/${req.file.filename}`;
    }

    await student.save();

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'UPDATE_STUDENT',
      details: `Updated student ${student.name} (${student.studentId})`
    });

    res.status(200).json({ success: true, data: student });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Super Admin & Admin)
export const deleteStudent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    // Role checks
    if (req.user?.role === 'admin' && student.branchId && student.branchId.toString() !== req.user.branchId?.toString()) {
      res.status(403).json({ success: false, message: 'Not authorized to delete student in another branch' });
      return;
    }

    await Student.findByIdAndDelete(req.params.id);

    // Delete associated attendance records
    if (student.studentId) {
      await Attendance.deleteMany({ studentId: student.studentId });
    }

    await ActivityLog.create({
      userId: req.user?._id,
      action: 'DELETE_STUDENT',
      details: `Deleted student ${student.name} (${student.studentId})`
    });

    res.status(200).json({ success: true, message: 'Student deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
