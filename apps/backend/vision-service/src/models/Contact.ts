import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
  name: string;
  email: string;
  message: string;
  createdAt: Date;
}

const ContactSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient querying
ContactSchema.index({ createdAt: -1 });

export default mongoose.model<IContact>('Contact', ContactSchema);