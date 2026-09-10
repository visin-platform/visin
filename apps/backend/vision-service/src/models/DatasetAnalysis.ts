import mongoose, { Document, Schema } from 'mongoose';

export interface IDatasetAnalysis extends Document {
  /** Absent on legacy records; never inferred from the first editor. */
  ownerId?: string;
  dataset: string; // 'waymo', 'zod', etc.
  fileId?: string; // file-service path of the uploaded dataset archive
  size?: string; // Human-readable size, derived from the uploaded file
  status?: 'pending' | 'ready'; // 'pending' until the archive finishes uploading
  data: Record<string, unknown>; // Dynamic JSON structure
  createdAt: Date;
  updatedAt: Date;
}

const DatasetAnalysisSchema: Schema = new Schema(
  {
    ownerId: { type: String, immutable: true, index: true },
    dataset: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    // Always a `datasets/<uuid>/<filename>` path handed out by
    // POST /analysis/upload-url — see `assertDatasetFileId`.
    fileId: {
      type: String,
      trim: true
    },
    size: {
      type: String,
      trim: true
    },
    // Written before the archive is uploaded, so a rejected insert (a bad name,
    // a constraint violation) surfaces in milliseconds instead of after a
    // multi-GB transfer. Flipped to 'ready' by POST /analysis/:id/complete.
    //
    // Defaults to 'ready': records created straight through POST
    // /analysis/upload have no upload to wait on, and records written before
    // this field existed carry no value at all — both must read as complete,
    // which is why every query filters on `$ne: 'pending'` rather than
    // `status: 'ready'`.
    status: {
      type: String,
      enum: ['pending', 'ready'],
      default: 'ready'
    },
    // Not `required`: an analysis legitimately starts with no JSON attached
    // (a record reserved before its archive uploads, or an archive with no
    // analysis payload). Marking it required made an empty analysis unsaveable
    // — see `minimize` below for why it arrived empty in the first place.
    data: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    // Mongoose strips empty objects before saving by default, so `data: {}` was
    // silently dropped on write and then failed the `required` validator on the
    // next save. Keeping empty objects also stops nested `{}` inside a stored
    // analysis payload from being quietly removed — `data` is opaque JSON we
    // must round-trip faithfully, not something to prune.
    minimize: false
  }
);

// Indexes for performance
DatasetAnalysisSchema.index({ dataset: 1, createdAt: -1 });
DatasetAnalysisSchema.index({ status: 1, createdAt: -1 });
DatasetAnalysisSchema.index({ createdAt: -1 });

export default mongoose.model<IDatasetAnalysis>('dataset_analysis', DatasetAnalysisSchema);
