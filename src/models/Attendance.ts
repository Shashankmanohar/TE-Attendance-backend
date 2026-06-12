import { Schema, model, Document } from 'mongoose';

export interface IAttendance extends Document {
  studentId: string; // References Student.studentId
  date: string; // Format YYYY-MM-DD
  time: string; // Format HH:MM:SS
  status: 'present' | 'absent' | 'late';
  scannerUserId: Schema.Types.ObjectId; // User who scanned for check-in
  checkOutTime?: string | null; // Format HH:MM:SS / AM PM
  checkOutScannerUserId?: Schema.Types.ObjectId | null; // User who scanned for check-out
  branchId?: Schema.Types.ObjectId | null;
  timestamp: Date;
}

const AttendanceSchema = new Schema<IAttendance>({
  studentId: { type: String, required: true, index: true },
  date: { type: String, required: true, index: true },
  time: { type: String, required: true },
  status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
  scannerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  checkOutTime: { type: String, default: null },
  checkOutScannerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  timestamp: { type: Date, default: Date.now }
});

// Ensure a student can only have one attendance record per day
AttendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });

export default model<IAttendance>('Attendance', AttendanceSchema);
