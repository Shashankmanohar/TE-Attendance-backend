import { Schema, model, Document } from 'mongoose';

export interface IBatch extends Document {
  name: string;
  class: '11th' | '12th' | 'Dropper';
  course: 'JEE' | 'NEET';
  subject: string;
  timings: string;
  branchId?: Schema.Types.ObjectId | null;
  createdAt: Date;
}

const BatchSchema = new Schema<IBatch>({
  name: { type: String, required: true, trim: true },
  class: { type: String, enum: ['11th', '12th', 'Dropper'], required: true },
  course: { type: String, enum: ['JEE', 'NEET'], required: true },
  subject: { type: String, required: true },
  timings: { type: String, required: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null },
  createdAt: { type: Date, default: Date.now }
});

export default model<IBatch>('Batch', BatchSchema);
