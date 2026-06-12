import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Student from '../models/Student';
import Attendance from '../models/Attendance';
import Batch from '../models/Batch';
import Branch from '../models/Branch';
import User from '../models/User';
import Staff from '../models/Staff';
import StaffAttendance from '../models/StaffAttendance';
import Faculty from '../models/Faculty';
import FacultyAttendance from '../models/FacultyAttendance';

// @desc    Get dashboard metrics (Total students, present/absent today, active batches, attendance percentage)
// @route   GET /api/dashboard/metrics
// @access  Private
export const getMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let query: any = {};
    let attendanceQuery: any = {};

    // Filter by branch
    if (req.user?.role !== 'super_admin') {
      query.branchId = req.user?.branchId;
      attendanceQuery.branchId = req.user?.branchId;
    }

    const today = new Date().toISOString().split('T')[0];
    attendanceQuery.date = today;

    // Total Students
    const totalStudents = await Student.countDocuments({ ...query, active: true });

    // Today's attendance
    const presentRecords = await Attendance.find({
      ...attendanceQuery,
      status: { $in: ['present', 'late'] }
    });
    const presentCount = presentRecords.length;

    const absentRecords = await Attendance.find({
      ...attendanceQuery,
      status: 'absent'
    });
    const absentCount = absentRecords.length;

    // Computed absent: students with no records today
    const unmarkedCount = totalStudents - (presentCount + absentCount);
    const computedAbsentCount = absentCount + (unmarkedCount > 0 ? unmarkedCount : 0);

    // Total Batches
    const totalBatches = await Batch.countDocuments(query);

    // Attendance percentage
    const attendancePercentage = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

    // Total Faculty & Staff
    const totalFaculty = await Faculty.countDocuments({ ...query, active: true });
    const totalStaff = await Staff.countDocuments({ ...query, active: true });

    // Present Faculty & Staff today counts
    const presentFacultyCount = await FacultyAttendance.countDocuments({
      ...attendanceQuery,
      status: { $in: ['present', 'late'] }
    });
    const presentStaffCount = await StaffAttendance.countDocuments({
      ...attendanceQuery,
      status: { $in: ['present', 'late'] }
    });

    // Present Faculty today list with names
    const facultyAttendancesToday = await FacultyAttendance.find({
      ...attendanceQuery,
      status: { $in: ['present', 'late'] }
    });

    const presentFacultyList = await Promise.all(
      facultyAttendancesToday.map(async (record) => {
        const facultyMember = await Faculty.findOne({ facultyId: record.facultyId })
          .select('name designation photoUrl');
        return {
          facultyId: record.facultyId,
          name: facultyMember ? facultyMember.name : 'Unknown Faculty',
          designation: facultyMember ? facultyMember.designation : 'Faculty',
          photoUrl: facultyMember ? facultyMember.photoUrl : '',
          time: record.time
        };
      })
    );

    // Branch analytics (only for Super Admin)
    let branchStats = [];
    if (req.user?.role === 'super_admin') {
      const branches = await Branch.find();
      for (const branch of branches) {
        const bStudents = await Student.countDocuments({ branchId: branch._id, active: true });
        const bPresent = await Attendance.countDocuments({
          branchId: branch._id,
          date: today,
          status: { $in: ['present', 'late'] }
        });
        branchStats.push({
          branchName: branch.name,
          totalStudents: bStudents,
          presentStudents: bPresent,
          percentage: bStudents > 0 ? Math.round((bPresent / bStudents) * 100) : 0
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        presentToday: presentCount,
        absentToday: computedAbsentCount,
        totalBatches,
        attendancePercentage,
        totalFaculty,
        presentFacultyToday: presentFacultyCount,
        totalStaff,
        presentStaffToday: presentStaffCount,
        presentFacultyList,
        branchStats
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get dashboard trends (Daily last 7 days, monthly, batch-wise comparison)
// @route   GET /api/dashboard/charts
// @access  Private
export const getCharts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let query: any = {};
    if (req.user?.role !== 'super_admin') {
      query.branchId = req.user?.branchId;
    }

    // 1. Daily Trend (Last 7 Days)
    const dailyData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      // Get count of active students on that day (approximated as current active count)
      const totalCount = await Student.countDocuments({ ...query, active: true });
      const presentCount = await Attendance.countDocuments({
        ...query,
        date: dateString,
        status: { $in: ['present', 'late'] }
      });

      // Get day name (Mon, Tue, etc.)
      const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

      dailyData.push({
        date: dateString,
        day: dayLabel,
        present: presentCount,
        absent: Math.max(0, totalCount - presentCount)
      });
    }

    // 2. Batch-wise comparison
    const batches = await Batch.find(query).limit(10);
    const batchData = [];
    const today = new Date().toISOString().split('T')[0];

    for (const batch of batches) {
      const studentIds = (await Student.find({ batchId: batch._id, active: true }).select('studentId')).map(s => s.studentId);
      const totalInBatch = studentIds.length;

      const presentInBatch = await Attendance.countDocuments({
        date: today,
        studentId: { $in: studentIds },
        status: { $in: ['present', 'late'] }
      });

      batchData.push({
        batchName: batch.name,
        total: totalInBatch,
        present: presentInBatch,
        percentage: totalInBatch > 0 ? Math.round((presentInBatch / totalInBatch) * 100) : 0
      });
    }

    // 3. Monthly Trend (Current Year)
    const monthlyData = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();

    // Grouping attendance by month
    for (let m = 0; m < 12; m++) {
      const monthPrefix = `${currentYear}-${String(m + 1).padStart(2, '0')}`;

      const presentCount = await Attendance.countDocuments({
        ...query,
        date: { $regex: new RegExp(`^${monthPrefix}`) },
        status: { $in: ['present', 'late'] }
      });

      monthlyData.push({
        month: months[m],
        presentCount
      });
    }

    res.status(200).json({
      success: true,
      data: {
        dailyTrends: dailyData,
        batchComparison: batchData,
        monthlyTrends: monthlyData
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get activity logs
// @route   GET /api/dashboard/logs
// @access  Private (Super Admin & Admin)
export const getActivityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let userQuery: any = {};
    if (req.user?.role === 'admin') {
      userQuery.branchId = req.user.branchId;
    }

    const users = await User.find(userQuery).select('_id');
    const userIds = users.map(u => u._id);

    const logs = await require('../models/ActivityLog').default.find({ userId: { $in: userIds } })
      .populate('userId', 'name role')
      .sort({ timestamp: -1 })
      .limit(100);

    res.status(200).json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
