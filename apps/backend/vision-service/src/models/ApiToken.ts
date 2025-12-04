import mongoose, { Document, Schema } from 'mongoose';

export interface IApiToken extends Document {
  name: string;
  tokenHash: string;
  prefix: string;
  projectId: mongoose.Types.ObjectId;
  createdBy: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApiTokenSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    tokenHash: {
      type: String,
      required: true,
      select: false
    },
    prefix: {
      type: String,
      required: true
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    createdBy: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date
    },
    lastUsedAt: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IApiToken>('ApiToken', ApiTokenSchema);
