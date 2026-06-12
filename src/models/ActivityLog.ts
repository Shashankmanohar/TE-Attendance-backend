import { Schema, model, Document } from 'mongoose';

export interface IActivityLog extends Document {
  userId: Schema.Types.ObjectId;
  action: string;
  details: string;
  timestamp: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  details: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

export default model<IActivityLog>('ActivityLog', ActivityLogSchema);
