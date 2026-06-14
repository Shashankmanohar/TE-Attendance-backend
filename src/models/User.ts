import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  userId: string; // Unique generated format e.g. USR-2026-000001
  name: string;
  email: string;
  password?: string;
  role: 'super_admin' | 'admin' | 'teacher' | 'scanner_operator';
  branchId: Schema.Types.ObjectId | null; // Null for super_admin
  qrCodeData?: string;
  active: boolean;
  createdAt: Date;
  matchPassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, unique: true, sparse: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'teacher', 'scanner_operator'],
    default: 'scanner_operator'
  },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
  qrCodeData: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password!, salt);
});

// Compare password
UserSchema.methods.matchPassword = async function (enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password || '');
};

export default model<IUser>('User', UserSchema);
