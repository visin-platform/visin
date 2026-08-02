import { Schema, model, Document, Types } from 'mongoose';
import { ImportMapping } from '../utils/bundlePaths';

export const IMPORT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export interface IImportError {
  path: string;
  reason: string;
}

export interface IImportJob extends Document {
  _id: Types.ObjectId;
  bundleId: Types.ObjectId;
  zipFileId: string;
  // Absent = the zip follows the default layout; set = folder-by-folder wiring
  // chosen in the mapping step, kept so a finished import stays explainable.
  mapping?: ImportMapping;
  status: ImportStatus;
  processed: number; // files ingested (incl. skipped-as-existing)
  skipped: number; // already present (resumed import)
  total?: number; // known once the whole zip has been walked
  fileErrors: IImportError[];
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ImportJobSchema = new Schema<IImportJob>(
  {
    bundleId: { type: Schema.Types.ObjectId, ref: 'LabelBundle', required: true, index: true },
    zipFileId: { type: String, required: true },
    mapping: {
      type: {
        _id: false,
        frames: { type: String, required: true },
        annotations: {
          type: [{ _id: false, path: { type: String, required: true }, set: { type: String, required: true } }],
          default: []
        },
        manifest: { type: String },
        idsSuffix: { type: String },
        masksSuffix: { type: String }
      },
      required: false
    },
    status: { type: String, enum: IMPORT_STATUSES, default: 'pending' },
    processed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    total: { type: Number },
    fileErrors: {
      type: [
        {
          _id: false,
          path: { type: String, required: true },
          reason: { type: String, required: true }
        }
      ],
      default: []
    },
    startedAt: { type: Date },
    finishedAt: { type: Date }
  },
  { timestamps: true }
);

export const ImportJob = model<IImportJob>('ImportJob', ImportJobSchema);
