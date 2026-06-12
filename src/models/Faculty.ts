import { Schema, model, Document } from 'mongoose';

export interface IFaculty extends Document {
  facultyId: string; // Unique generated format e.g. FAC-2026-000001
  name: string;
  designation: string;
  phoneNumber: string;
  email?: string;
  address: string;
  joiningDate: Date;
  photoUrl: string;
  branchId?: Schema.Types.ObjectId | null;
  qrCodeData: string;
  active: boolean;
  createdAt: Date;
}

const FacultySchema = new Schema<IFaculty>({
  facultyId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true },
  email: { type: String, lowercase: true, trim: true },
  address: { type: String, required: true },
  joiningDate: { type: Date, default: Date.now },
  photoUrl: { type: String, default: '' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
  qrCodeData: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default model<IFaculty>('Faculty', FacultySchema);
