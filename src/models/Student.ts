import { Schema, model, Document } from 'mongoose';

export interface IStudent extends Document {
  studentId: string; // Unique generated format e.g. STU-2026-000001
  name: string;
  rollNumber: string;
  phoneNumber: string;
  parentPhoneNumber?: string;
  fatherName?: string;
  address: string;
  admissionDate: Date;
  photoUrl: string;
  class: '11th' | '12th' | 'Dropper';
  course: 'JEE' | 'NEET';
  batchId: Schema.Types.ObjectId;
  branchId?: Schema.Types.ObjectId | null;
  qrCodeData: string;
  active: boolean;
  createdAt: Date;
}

const StudentSchema = new Schema<IStudent>({
  studentId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  rollNumber: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true },
  parentPhoneNumber: { type: String },
  fatherName: { type: String, trim: true },
  address: { type: String, required: true },
  admissionDate: { type: Date, default: Date.now },
  photoUrl: { type: String, default: '' },
  class: { type: String, enum: ['11th', '12th', 'Dropper'], required: true },
  course: { type: String, enum: ['JEE', 'NEET'], required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
  qrCodeData: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default model<IStudent>('Student', StudentSchema);
