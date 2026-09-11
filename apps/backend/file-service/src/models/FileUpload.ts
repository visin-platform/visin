import mongoose, { Schema } from 'mongoose';
import type { UploadPolicy } from '@visin/backend-core';

export interface UploadPart { id: string; size: number }
export interface UploadState {
  fileId: string;
  mode: 'public' | 'internal';
  reservationId?: string;
  expiresMs?: number;
  policy?: UploadPolicy;
  offset: number;
  total: number | null;
  status: 'uploading' | 'complete' | 'retired';
  parts: UploadPart[];
  published?: UploadPart & { lastModified: string };
}
interface FileUploadRecord {
  _id: string;
  fileId: string;
  state?: UploadState;
  owner?: string;
  leaseUntil?: Date;
}
const schema = new Schema<FileUploadRecord>({
  _id: { type: String, required: true },
  fileId: { type: String, required: true, index: true },
  state: Schema.Types.Mixed,
  owner: String,
  leaseUntil: Date
}, { collection: 'file_uploads', versionKey: false, bufferCommands: false });

export const FileUpload = mongoose.model<FileUploadRecord>('FileUpload', schema);
