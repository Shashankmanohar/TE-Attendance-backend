import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Student from '../models/Student';
import Staff from '../models/Staff';
import Faculty from '../models/Faculty';
import Attendance from '../models/Attendance';
import StaffAttendance from '../models/StaffAttendance';
import FacultyAttendance from '../models/FacultyAttendance';
import Batch from '../models/Batch';
import User from '../models/User';
import { emitLiveScan } from '../config/socket';

// Helper to check if scanned time is late relative to batch start time
const determineStatus = (currentTime: string, batchTimings: string): 'present' | 'late' => {
  try {
    // Expected format of batchTimings: "08:00 AM - 10:00 AM"
    const startStr = batchTimings.split('-')[0].trim(); // "08:00 AM"
    
    const parseTimeToMinutes = (timeStr: string): number => {
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (hours === 12) {
        hours = 0;
      }
      if (modifier.toLowerCase() === 'pm') {
        hours += 12;
      }
      return hours * 60 + minutes;
    };

    const currentMinutes = parseTimeToMinutes(currentTime);
    const startMinutes = parseTimeToMinutes(startStr);

    // If student is scanning more than 15 minutes after batch start time, mark as late
    if (currentMinutes > startMinutes + 15) {
      return 'late';
    }
  } catch (error) {
    // Fallback if timings parsing fails
  }
  return 'present';
};

// @desc    Scan QR and mark attendance
// @route   POST /api/attendance/scan
// @access  Private (Admin & Scanner Operator)
export const markAttendanceScan = async (req: AuthRequest, res: Response): Promise<void> => {
  const { studentId, mode = 'check_in' } = req.body;

  if (!studentId) {
    res.status(400).json({ success: false, message: 'Student ID is required' });
    return;
  }

  try {
    // Handle Staff scan
    if (studentId.startsWith('STF-')) {
      const staff = await Staff.findOne({ staffId: studentId, active: true }).populate('branchId', 'name');
      if (!staff) {
        res.status(404).json({ success: false, message: 'Staff not found or inactive' });
        return;
      }

      const staffBranchId = staff.branchId
        ? (typeof staff.branchId === 'object' && '_id' in (staff.branchId as any)
          ? (staff.branchId as any)._id?.toString()
          : staff.branchId.toString())
        : null;
      const userBranchId = req.user?.branchId?.toString() || null;

      if (req.user?.role !== 'super_admin' && staffBranchId !== userBranchId) {
        res.status(403).json({ success: false, message: 'You are not authorized to scan for this branch' });
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let attendance;
      let modePerformed = 'check_in';
      let attendanceRecord = await StaffAttendance.findOne({ staffId: studentId, date: today });

      if (attendanceRecord) {
        if (attendanceRecord.checkOutTime) {
          res.status(400).json({
            success: false,
            message: 'Attendance already completed (Checked In & Checked Out) for today',
            student: {
              name: staff.name,
              rollNumber: staff.designation,
              class: 'Staff',
              course: staff.staffId,
              photoUrl: staff.photoUrl,
              time: attendanceRecord.time,
              checkOutTime: attendanceRecord.checkOutTime
            }
          });
          return;
        }

        const checkInDate = new Date(attendanceRecord.timestamp);
        const diffMs = now.getTime() - checkInDate.getTime();
        const diffMins = diffMs / (1000 * 60);

        if (diffMins >= 2) {
          attendanceRecord.checkOutTime = timeStr;
          attendanceRecord.checkOutScannerUserId = req.user?.id;
          attendance = await attendanceRecord.save();
          modePerformed = 'check_out';
        } else {
          const remainingSeconds = Math.ceil(120 - (diffMs / 1000));
          res.status(400).json({
            success: false,
            message: `Attendance already marked today. Checkout activates in ${remainingSeconds}s.`,
            student: {
              name: staff.name,
              rollNumber: staff.designation,
              class: 'Staff',
              course: staff.staffId,
              photoUrl: staff.photoUrl,
              time: attendanceRecord.time
            }
          });
          return;
        }
      } else {
        attendance = await StaffAttendance.create({
          staffId: studentId,
          date: today,
          time: timeStr,
          status: 'present',
          scannerUserId: req.user?.id,
          branchId: staff.branchId,
          timestamp: now
        });
        modePerformed = 'check_in';
      }

      const totalStaff = await Staff.countDocuments({ branchId: staff.branchId, active: true });
      const presentStaff = await StaffAttendance.countDocuments({
        branchId: staff.branchId,
        date: today,
        status: { $in: ['present', 'late'] }
      });

      const liveScanData = {
        attendanceId: attendance._id,
        studentId: staff.staffId,
        name: staff.name,
        rollNumber: staff.designation,
        class: 'Staff',
        course: staff.staffId,
        batchName: staff.designation,
        photoUrl: staff.photoUrl,
        time: attendance.time,
        checkOutTime: attendance.checkOutTime || null,
        status: attendance.status,
        livePresentCount: presentStaff,
        liveTotalCount: totalStaff,
        scanMode: modePerformed
      };

      emitLiveScan(staff.branchId ? staff.branchId.toString() : 'global', liveScanData);

      res.status(200).json({
        success: true,
        message: modePerformed === 'check_out' ? 'Checked out successfully!' : `Attendance marked as ${attendance.status.toUpperCase()}!`,
        data: liveScanData
      });
      return;
    }

    // Handle Faculty scan
    if (studentId.startsWith('FAC-')) {
      const faculty = await Faculty.findOne({ facultyId: studentId, active: true }).populate('branchId', 'name');
      if (!faculty) {
        res.status(404).json({ success: false, message: 'Faculty not found or inactive' });
        return;
      }

      const facultyBranchId = faculty.branchId
        ? (typeof faculty.branchId === 'object' && '_id' in (faculty.branchId as any)
          ? (faculty.branchId as any)._id?.toString()
          : faculty.branchId.toString())
        : null;
      const userBranchId = req.user?.branchId?.toString() || null;

      if (req.user?.role !== 'super_admin' && facultyBranchId !== userBranchId) {
        res.status(403).json({ success: false, message: 'You are not authorized to scan for this branch' });
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let attendance;
      let modePerformed = 'check_in';
      let attendanceRecord = await FacultyAttendance.findOne({ facultyId: studentId, date: today });

      if (attendanceRecord) {
        if (attendanceRecord.checkOutTime) {
          res.status(400).json({
            success: false,
            message: 'Attendance already completed (Checked In & Checked Out) for today',
            student: {
              name: faculty.name,
              rollNumber: faculty.designation,
              class: 'Faculty',
              course: faculty.facultyId,
              photoUrl: faculty.photoUrl,
              time: attendanceRecord.time,
              checkOutTime: attendanceRecord.checkOutTime
            }
          });
          return;
        }

        const checkInDate = new Date(attendanceRecord.timestamp);
        const diffMs = now.getTime() - checkInDate.getTime();
        const diffMins = diffMs / (1000 * 60);

        if (diffMins >= 2) {
          attendanceRecord.checkOutTime = timeStr;
          attendanceRecord.checkOutScannerUserId = req.user?.id;
          attendance = await attendanceRecord.save();
          modePerformed = 'check_out';
        } else {
          const remainingSeconds = Math.ceil(120 - (diffMs / 1000));
          res.status(400).json({
            success: false,
            message: `Attendance already marked today. Checkout activates in ${remainingSeconds}s.`,
            student: {
              name: faculty.name,
              rollNumber: faculty.designation,
              class: 'Faculty',
              course: faculty.facultyId,
              photoUrl: faculty.photoUrl,
              time: attendanceRecord.time
            }
          });
          return;
        }
      } else {
        attendance = await FacultyAttendance.create({
          facultyId: studentId,
          date: today,
          time: timeStr,
          status: 'present',
          scannerUserId: req.user?.id,
          branchId: faculty.branchId,
          timestamp: now
        });
        modePerformed = 'check_in';
      }

      const totalFaculty = await Faculty.countDocuments({ branchId: faculty.branchId, active: true });
      const presentFaculty = await FacultyAttendance.countDocuments({
        branchId: faculty.branchId,
        date: today,
        status: { $in: ['present', 'late'] }
      });

      const liveScanData = {
        attendanceId: attendance._id,
        studentId: faculty.facultyId,
        name: faculty.name,
        rollNumber: faculty.designation,
        class: 'Faculty',
        course: faculty.facultyId,
        batchName: faculty.designation,
        photoUrl: faculty.photoUrl,
        time: attendance.time,
        checkOutTime: attendance.checkOutTime || null,
        status: attendance.status,
        livePresentCount: presentFaculty,
        liveTotalCount: totalFaculty,
        scanMode: modePerformed
      };

      emitLiveScan(faculty.branchId ? faculty.branchId.toString() : 'global', liveScanData);

      res.status(200).json({
        success: true,
        message: modePerformed === 'check_out' ? 'Checked out successfully!' : `Attendance marked as ${attendance.status.toUpperCase()}!`,
        data: liveScanData
      });
      return;
    }

    // 1. Find the student
    const student = await Student.findOne({ studentId, active: true })
      .populate('batchId', 'name timings subject')
      .populate('branchId', 'name');

    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found or inactive' });
      return;
    }

    // Role verification (Scanner can only scan for their own branch)
    const studentBranchId = student.branchId
      ? (typeof student.branchId === 'object' && '_id' in (student.branchId as any)
        ? (student.branchId as any)._id?.toString()
        : student.branchId.toString())
      : null;
    const userBranchId = req.user?.branchId?.toString() || null;

    if (req.user?.role !== 'super_admin' && studentBranchId !== userBranchId) {
      res.status(403).json({ success: false, message: 'You are not authorized to scan for this branch' });
      return;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }); // e.g., "08:15 AM"

    const batch = student.batchId as any;
    const branchDbId = student.branchId
      ? (typeof student.branchId === 'object' && '_id' in (student.branchId as any)
        ? (student.branchId as any)._id
        : student.branchId)
      : null;

    let attendance;
    let modePerformed = 'check_in';

    let attendanceRecord = await Attendance.findOne({ studentId, date: today });

    if (attendanceRecord) {
      if (attendanceRecord.checkOutTime) {
        res.status(400).json({
          success: false,
          message: 'Attendance already completed (Checked In & Checked Out) for today',
          student: {
            name: student.name,
            rollNumber: student.rollNumber,
            class: student.class,
            course: student.course,
            photoUrl: student.photoUrl,
            time: attendanceRecord.time,
            checkOutTime: attendanceRecord.checkOutTime
          }
        });
        return;
      }

      // Check time elapsed since check-in
      const checkInDate = new Date(attendanceRecord.timestamp);
      const diffMs = now.getTime() - checkInDate.getTime();
      const diffMins = diffMs / (1000 * 60);

      if (diffMins >= 2) {
        // Automatically check out after 2 minutes
        attendanceRecord.checkOutTime = timeStr;
        attendanceRecord.checkOutScannerUserId = req.user?.id;
        attendance = await attendanceRecord.save();
        modePerformed = 'check_out';
      } else {
        const remainingSeconds = Math.ceil(120 - (diffMs / 1000));
        res.status(400).json({
          success: false,
          message: `Attendance already marked today. Checkout activates in ${remainingSeconds}s.`,
          student: {
            name: student.name,
            rollNumber: student.rollNumber,
            class: student.class,
            course: student.course,
            photoUrl: student.photoUrl,
            time: attendanceRecord.time
          }
        });
        return;
      }
    } else {
      // Create new record (Check-In)
      const status = determineStatus(timeStr, batch?.timings || '');
      attendance = await Attendance.create({
        studentId,
        date: today,
        time: timeStr,
        status,
        scannerUserId: req.user?.id,
        branchId: branchDbId,
        timestamp: now
      });
      modePerformed = 'check_in';
    }

    // 5. Calculate updated metrics for live sync
    const totalStudents = await Student.countDocuments({ branchId: branchDbId, active: true });
    const presentStudents = await Attendance.countDocuments({
      branchId: branchDbId,
      date: today,
      status: { $in: ['present', 'late'] }
    });

    const liveScanData = {
      attendanceId: attendance._id,
      studentId: student.studentId,
      name: student.name,
      rollNumber: student.rollNumber,
      class: student.class,
      course: student.course,
      batchName: batch?.name || 'N/A',
      photoUrl: student.photoUrl,
      time: attendance.time,
      checkOutTime: attendance.checkOutTime || null,
      status: attendance.status,
      livePresentCount: presentStudents,
      liveTotalCount: totalStudents,
      scanMode: modePerformed
    };

    // 6. Broadcast via Socket.io
    emitLiveScan(branchDbId ? branchDbId.toString() : 'global', liveScanData);

    // 7. Mock Parent notification triggers (ready for API integration)
    console.log(`[Notification Triggered] to Parent (${student.parentPhoneNumber}): Dear Parent, your child ${student.name} ${modePerformed === 'check_out' ? 'left' : 'arrived at'} coaching institute at ${timeStr}.`);

    res.status(200).json({
      success: true,
      message: modePerformed === 'check_out' ? 'Checked out successfully!' : `Attendance marked as ${attendance.status.toUpperCase()}!`,
      data: liveScanData
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance logs with filters
// @route   GET /api/attendance
// @access  Private
export const getAttendanceRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, date, startDate, endDate, classLvl, course, batchId, search, status, page = 1, limit = 50 } = req.query;

  try {
    if (type === 'staff' || (search && String(search).startsWith('STF-'))) {
      let query: any = {};
      if (req.user?.role !== 'super_admin') {
        query.branchId = req.user?.branchId;
      }
      if (startDate && endDate) {
        query.date = { $gte: String(startDate), $lte: String(endDate) };
      } else if (date) {
        query.date = String(date);
      } else {
        query.date = new Date().toISOString().split('T')[0];
      }
      if (status) {
        query.status = status;
      }

      let staffFilters: any = {};
      if (search) {
        staffFilters.$or = [
          { name: new RegExp(String(search), 'i') },
          { staffId: new RegExp(String(search), 'i') },
          { designation: new RegExp(String(search), 'i') }
        ];
      }

      let staffIds: string[] = [];
      if (Object.keys(staffFilters).length > 0) {
        const matchedStaff = await Staff.find(staffFilters).select('staffId');
        staffIds = matchedStaff.map(s => s.staffId);
        query.staffId = { $in: staffIds };
      }

      const pg = parseInt(String(page), 10);
      const lim = parseInt(String(limit), 10);
      const skip = (pg - 1) * lim;

      const records = await StaffAttendance.find(query)
        .populate('scannerUserId', 'name')
        .populate('branchId', 'name')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(lim)
        .lean();

      const populatedRecords = await Promise.all(
        records.map(async (record) => {
          const staffMember = await Staff.findOne({ staffId: record.staffId })
            .select('name designation photoUrl');
          return {
            ...record,
            student: staffMember ? {
              name: staffMember.name,
              rollNumber: staffMember.designation,
              class: 'Staff',
              course: record.staffId,
              photoUrl: staffMember.photoUrl
            } : null
          };
        })
      );

      const total = await StaffAttendance.countDocuments(query);
      res.status(200).json({
        success: true,
        count: populatedRecords.length,
        total,
        pages: Math.ceil(total / lim),
        currentPage: pg,
        data: populatedRecords
      });
      return;
    }

    if (type === 'faculty' || (search && String(search).startsWith('FAC-'))) {
      let query: any = {};
      if (req.user?.role !== 'super_admin') {
        query.branchId = req.user?.branchId;
      }
      if (startDate && endDate) {
        query.date = { $gte: String(startDate), $lte: String(endDate) };
      } else if (date) {
        query.date = String(date);
      } else {
        query.date = new Date().toISOString().split('T')[0];
      }
      if (status) {
        query.status = status;
      }

      let facultyFilters: any = {};
      if (search) {
        facultyFilters.$or = [
          { name: new RegExp(String(search), 'i') },
          { facultyId: new RegExp(String(search), 'i') },
          { designation: new RegExp(String(search), 'i') }
        ];
      }

      let facultyIds: string[] = [];
      if (Object.keys(facultyFilters).length > 0) {
        const matchedFaculty = await Faculty.find(facultyFilters).select('facultyId');
        facultyIds = matchedFaculty.map(f => f.facultyId);
        query.facultyId = { $in: facultyIds };
      }

      const pg = parseInt(String(page), 10);
      const lim = parseInt(String(limit), 10);
      const skip = (pg - 1) * lim;

      const records = await FacultyAttendance.find(query)
        .populate('scannerUserId', 'name')
        .populate('branchId', 'name')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(lim)
        .lean();

      const populatedRecords = await Promise.all(
        records.map(async (record) => {
          const facultyMember = await Faculty.findOne({ facultyId: record.facultyId })
            .select('name designation photoUrl');
          return {
            ...record,
            student: facultyMember ? {
              name: facultyMember.name,
              rollNumber: facultyMember.designation,
              class: 'Faculty',
              course: record.facultyId,
              photoUrl: facultyMember.photoUrl
            } : null
          };
        })
      );

      const total = await FacultyAttendance.countDocuments(query);
      res.status(200).json({
        success: true,
        count: populatedRecords.length,
        total,
        pages: Math.ceil(total / lim),
        currentPage: pg,
        data: populatedRecords
      });
      return;
    }
    let query: any = {};

    // Filter by branch
    if (req.user?.role !== 'super_admin') {
      query.branchId = req.user?.branchId;
    }

    // Date range filter
    if (startDate && endDate) {
      query.date = { $gte: String(startDate), $lte: String(endDate) };
    } else if (date) {
      query.date = String(date);
    } else {
      // Default to today
      query.date = new Date().toISOString().split('T')[0];
    }

    if (status) {
      query.status = status;
    }

    // Find student IDs that match search, class, course, batch
    let studentFilters: any = {};
    if (classLvl) studentFilters.class = classLvl;
    if (course) studentFilters.course = course;
    if (batchId) studentFilters.batchId = batchId;

    if (search) {
      studentFilters.$or = [
        { name: new RegExp(String(search), 'i') },
        { studentId: new RegExp(String(search), 'i') },
        { rollNumber: new RegExp(String(search), 'i') }
      ];
    }

    let studentIds: string[] = [];
    if (Object.keys(studentFilters).length > 0) {
      const matchedStudents = await Student.find(studentFilters).select('studentId');
      studentIds = matchedStudents.map(s => s.studentId);
      query.studentId = { $in: studentIds };
    }

    const pg = parseInt(String(page), 10);
    const lim = parseInt(String(limit), 10);
    const skip = (pg - 1) * lim;

    const records = await Attendance.find(query)
      .populate('scannerUserId', 'name')
      .populate('branchId', 'name')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(lim)
      .lean();

    // Attach student details to records
    const populatedRecords = await Promise.all(
      records.map(async (record) => {
        const student = await Student.findOne({ studentId: record.studentId })
          .populate('batchId', 'name')
          .select('name rollNumber class course batchId photoUrl');
        return {
          ...record,
          student
        };
      })
    );

    const total = await Attendance.countDocuments(query);

    res.status(200).json({
      success: true,
      count: populatedRecords.length,
      total,
      pages: Math.ceil(total / lim),
      currentPage: pg,
      data: populatedRecords
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Manual correction of attendance
// @route   POST /api/attendance/manual
// @access  Private (Super Admin & Admin)
export const manualCorrection = async (req: AuthRequest, res: Response): Promise<void> => {
  const { studentId, date, status } = req.body;

  if (!studentId || !date || !status) {
    res.status(400).json({ success: false, message: 'Please provide studentId, date, and status' });
    return;
  }

  try {
    const student = await Student.findOne({ studentId });
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    // Role check
    const studentBranchIdStr = student.branchId ? student.branchId.toString() : null;
    const userBranchIdStr = req.user?.branchId ? req.user.branchId.toString() : null;
    if (req.user?.role === 'admin' && studentBranchIdStr !== userBranchIdStr) {
      res.status(403).json({ success: false, message: 'Unauthorized for this branch' });
      return;
    }

    // Find existing or create
    let record = await Attendance.findOne({ studentId, date });
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    if (record) {
      record.status = status;
      record.scannerUserId = req.user?.id;
      await record.save();
    } else {
      record = await Attendance.create({
        studentId,
        date,
        time: timeStr,
        status,
        scannerUserId: req.user?.id,
        branchId: student.branchId,
        timestamp: now
      });
    }

    res.status(200).json({ success: true, message: 'Attendance updated successfully', data: record });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
