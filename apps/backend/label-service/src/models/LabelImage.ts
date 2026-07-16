import { Schema, model, Document, Types } from 'mongoose';

export const IMAGE_KINDS = ['frame', 'layer', 'idmap'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export interface IMaskMeta {
  id: number;
  class: string;
  bbox?: number[]; // [x1, y1, x2, y2]
  [key: string]: unknown; // triage outcome, disagreement flags, scores, ...
}

export interface ILabelImage extends Document {
  _id: Types.ObjectId;
  bundleId: Types.ObjectId;
  path: string; // full path inside the bundle zip — unique per bundle
  stem: string; // basename without extension(s) — the frame↔layer link key
  kind: ImageKind;
  annotationSet?: string; // layer/idmap only
  fileId: string; // file-service path
  thumbnailFileId?: string;
  width?: number;
  height?: number;
  size: number;
  mimetype: string;
  metadata?: { masks?: IMaskMeta[] }; // idmap only: from <stem>.masks.json
  createdAt: Date;
  updatedAt: Date;
}

const LabelImageSchema = new Schema<ILabelImage>(
  {
    bundleId: { type: Schema.Types.ObjectId, ref: 'LabelBundle', required: true },
    path: { type: String, required: true },
    stem: { type: String, required: true },
    kind: { type: String, enum: IMAGE_KINDS, required: true },
    annotationSet: { type: String },
    fileId: { type: String, required: true },
    thumbnailFileId: { type: String },
    width: Number,
    height: Number,
    size: { type: Number, required: true },
    mimetype: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

LabelImageSchema.index({ bundleId: 1, path: 1 }, { unique: true });
LabelImageSchema.index({ bundleId: 1, kind: 1, stem: 1 });
LabelImageSchema.index({ bundleId: 1, annotationSet: 1, stem: 1 });

export const LabelImage = model<ILabelImage>('LabelImage', LabelImageSchema);
