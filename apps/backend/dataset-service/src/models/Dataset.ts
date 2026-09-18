import { Schema, model, Document, Types } from 'mongoose';

export const DATASET_VISIBILITIES = ['public', 'group'] as const;
export type DatasetVisibility = (typeof DATASET_VISIBILITIES)[number];

export const IMPORT_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** One zip folder (and everything beneath it) assigned to a group. `''` is the zip root. */
export interface FolderMapping {
  folder: string;
  group: string;
}

export interface ImportMapping {
  groups: FolderMapping[];
  /** full path of a CSV/JSONL inside the zip whose rows become per-stem attributes */
  manifest?: string;
}

export interface ImportError {
  path: string;
  reason: string;
}

export interface DatasetImport {
  id: string;
  status: ImportStatus;
  mapping: ImportMapping;
  /** the archive this import read — a later zip replacement leaves it pointing at the old one */
  archiveFileId: string;
  /** where this import's extracted files live; absent for items that arrived by migration */
  folder?: string;
  processed: number;
  skipped: number;
  total?: number;
  errors: ImportError[];
  startedAt?: Date;
  finishedAt?: Date;
  heartbeatAt?: Date;
}

export interface ContentsFolder {
  path: string;
  depth: number;
  /** counts include everything beneath the folder */
  files: number;
  images: number;
  jsons: number;
  bytes: number;
}

export interface DatasetContents {
  entries: number;
  totalBytes: number;
  /** more folders than were kept; the deepest ones are left out */
  truncated: boolean;
  folders: ContentsFolder[];
  extensions: { ext: string; files: number; bytes: number }[];
}

export const SCAN_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

/** Reading a zip's index, done in the background after an upload so the browser can leave. */
export interface DatasetScan {
  status: ScanStatus;
  /** the archive being read — a newer upload supersedes it */
  fileId: string;
  error?: string;
  finishedAt?: Date;
}

export interface DatasetGroup {
  name: string;
  images: number;
  jsons: number;
}

export interface ManifestRow {
  stem: string;
  attributes: Record<string, string>;
}

/** Another service's claim on this dataset's files — e.g. a label job whose tasks show them. */
export interface DatasetHold {
  service: string;
  ref: string;
  createdAt: Date;
}

export interface IDataset extends Document {
  _id: Types.ObjectId;
  ownerId: string;
  name: string;
  description?: string;
  visibility: DatasetVisibility;
  groupId?: string;
  /** every file of this dataset lives under this file-service prefix */
  storagePrefix: string;
  /** `size` and `contents` are absent until the zip has been scanned (a migrated dataset starts that way) */
  archive?: { fileId: string; filename: string; size?: number; uploadedAt: Date };
  /** `size`/`lastModified` identify the browser's file, so choosing it again resumes the upload */
  pendingUpload?: { fileId: string; filename: string; size?: number; lastModified?: number; expiresAt: Date };
  contents?: DatasetContents;
  scan?: DatasetScan;
  groups: DatasetGroup[];
  imageCount: number;
  coverFileId?: string;
  manifest?: ManifestRow[];
  import?: DatasetImport;
  holds: DatasetHold[];
  createdAt: Date;
  updatedAt: Date;
}

const HoldSchema = new Schema<DatasetHold>(
  { service: { type: String, required: true }, ref: { type: String, required: true }, createdAt: Date },
  { _id: false }
);

const DatasetSchema = new Schema<IDataset>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 10000 },
    visibility: { type: String, enum: DATASET_VISIBILITIES, default: 'public' },
    groupId: { type: String, index: true },
    storagePrefix: { type: String, required: true },
    archive: {
      type: {
        _id: false,
        fileId: { type: String, required: true },
        filename: { type: String, required: true },
        size: { type: Number },
        uploadedAt: { type: Date, required: true }
      },
      default: undefined
    },
    pendingUpload: {
      type: {
        _id: false,
        fileId: { type: String, required: true },
        filename: { type: String, required: true },
        size: { type: Number },
        lastModified: { type: Number },
        expiresAt: { type: Date, required: true }
      },
      default: undefined
    },
    // Opaque summaries written whole; nothing queries inside them.
    contents: { type: Schema.Types.Mixed },
    scan: { type: Schema.Types.Mixed },
    groups: {
      type: [{ _id: false, name: { type: String, required: true }, images: Number, jsons: Number }],
      default: []
    },
    imageCount: { type: Number, default: 0 },
    coverFileId: { type: String },
    manifest: { type: [Schema.Types.Mixed], default: undefined, select: false },
    import: { type: Schema.Types.Mixed },
    holds: { type: [HoldSchema], default: [] }
  },
  { timestamps: true, minimize: false }
);

DatasetSchema.index({ visibility: 1, updatedAt: -1 });
DatasetSchema.index({ name: 'text', description: 'text' });

export const Dataset = model<IDataset>('Dataset', DatasetSchema, 'datasets');
