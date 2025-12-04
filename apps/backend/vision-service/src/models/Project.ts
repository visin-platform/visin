import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description?: string;
  isPublic: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true
    },
    ownerId: {
      type: String,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Index for searching
ProjectSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IProject>('Project', ProjectSchema);
