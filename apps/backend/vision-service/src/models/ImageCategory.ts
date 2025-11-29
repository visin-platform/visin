import mongoose, { Document, Schema } from 'mongoose';

export interface IImageCategory extends Document {
  name: string;
  description?: string;
  datasetId: string; // Reference to dataset
  color?: string; // Optional color for UI
  createdAt: Date;
  updatedAt: Date;
}

const ImageCategorySchema: Schema = new Schema(
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
    datasetId: {
      type: Schema.Types.ObjectId,
      ref: 'training_dataset',
      required: true
    },
    color: {
      type: String,
      trim: true,
      maxlength: 7 // Hex color code like #FF0000
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
ImageCategorySchema.index({ datasetId: 1, name: 1 }, { unique: true });
ImageCategorySchema.index({ datasetId: 1, createdAt: -1 });

export default mongoose.model<IImageCategory>('ImageCategory', ImageCategorySchema);