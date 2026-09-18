import { Schema, model, Document, Types } from 'mongoose';

export const ITEM_KINDS = ['image', 'json'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * One file imported out of a dataset zip.
 *
 * Images keep their bytes on file-service; JSON sidecars keep their parsed
 * content here, because what reads them (a label job slicing masks by field)
 * needs to query it. `stem` + `variant` is how files that describe the same
 * frame find each other across and within groups: `0001.png`, `0001.ids.png`
 * and `0001.masks.json` share stem `0001` with variants none, `ids`, `masks`.
 */
export interface IDatasetItem extends Document {
  _id: Types.ObjectId;
  datasetId: Types.ObjectId;
  /** the import that created it; absent for migrated items */
  importId?: string;
  group: string;
  /** full path inside the zip — unique per dataset */
  path: string;
  stem: string;
  variant?: string;
  kind: ItemKind;
  fileId?: string;
  thumbnailFileId?: string;
  width?: number;
  height?: number;
  size: number;
  mimetype?: string;
  data?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const DatasetItemSchema = new Schema<IDatasetItem>(
  {
    datasetId: { type: Schema.Types.ObjectId, ref: 'Dataset', required: true },
    importId: { type: String },
    group: { type: String, required: true },
    path: { type: String, required: true },
    stem: { type: String, required: true },
    variant: { type: String },
    kind: { type: String, enum: ITEM_KINDS, required: true },
    fileId: { type: String },
    thumbnailFileId: { type: String },
    width: Number,
    height: Number,
    size: { type: Number, required: true },
    mimetype: { type: String },
    data: { type: Schema.Types.Mixed }
  },
  { timestamps: true, minimize: false }
);

DatasetItemSchema.index({ datasetId: 1, path: 1 }, { unique: true });
DatasetItemSchema.index({ datasetId: 1, kind: 1, group: 1, path: 1 });
DatasetItemSchema.index({ datasetId: 1, group: 1, stem: 1 });

export const DatasetItem = model<IDatasetItem>('DatasetItem', DatasetItemSchema, 'dataset_items');
