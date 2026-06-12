import { Schema, model, Document } from 'mongoose';

export interface IBranch extends Document {
  name: string;
  address: string;
  active: boolean;
  createdAt: Date;
}

const BranchSchema = new Schema<IBranch>({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default model<IBranch>('Branch', BranchSchema);
