import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  name: string;
  slug?: string;
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
    slug: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      sparse: true // Allow null/undefined values
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
