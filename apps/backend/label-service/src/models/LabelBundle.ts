import { Schema, model, Document, Types } from 'mongoose';

export const BUNDLE_STATUSES = ['empty', 'importing', 'ready', 'failed'] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

export interface IManifestRow {
  stem: string;
  stratum?: string;
}

export interface ILabelBundle extends Document {
  _id: Types.ObjectId;
  name: string;
  groupId: string;
  createdBy: {
    userId: string;
    email: string;
    name?: string;
  };
  annotationSets: string[]; // discovered at ingest from ann/<set>/ folders
  counts: { frames: number; layers: number };
  manifest?: IManifestRow[]; // parsed manifest.csv|jsonl from the zip, if present
  status: BundleStatus;
  createdAt: Date;
  updatedAt: Date;
}

const LabelBundleSchema = new Schema<ILabelBundle>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    groupId: { type: String, required: true, index: true },
    createdBy: {
      userId: { type: String, required: true },
      email: { type: String, required: true, lowercase: true },
      name: { type: String }
    },
    annotationSets: [{ type: String, trim: true }],
    counts: {
      frames: { type: Number, default: 0 },
      layers: { type: Number, default: 0 }
    },
    manifest: {
      type: [
        {
          _id: false,
          stem: { type: String, required: true },
          stratum: { type: String }
        }
      ],
      default: undefined
    },
    status: { type: String, enum: BUNDLE_STATUSES, default: 'empty', index: true }
  },
  { timestamps: true }
);

export const LabelBundle = model<ILabelBundle>('LabelBundle', LabelBundleSchema);
