import mongoose, { Document, Schema } from 'mongoose';

export const PAPER_DOCUMENT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type PaperDocumentStatus = (typeof PAPER_DOCUMENT_STATUSES)[number];

/**
 * The state of a paper's PDF: read into the pages in `PaperPage` so the paper can be searched and quoted by page. The PDF is cached in file
 * storage under `fileId` and shown from there, so a reader does not depend on the publisher's server being up.
 *
 * It is derived, never authoritative: the paper's owner can ask for it to be read again, and it is replaced whole.
 */
export interface IPaperDocument extends Document {
  paperId: string;
  /** the address the PDF was read from, so a changed address is noticed */
  sourceUrl: string;
  status: PaperDocumentStatus;
  /** a short reason, safe to show: never the server's own error */
  error?: string;
  fileId?: string;
  size?: number;
  pageCount?: number;
  /** the paper was longer than the limits in the service, so the later pages are missing */
  truncated?: boolean;
  startedAt?: Date;
  indexedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaperDocumentSchema = new Schema<IPaperDocument>(
  {
    paperId: { type: String, required: true, unique: true },
    sourceUrl: { type: String, required: true, maxlength: 600 },
    status: { type: String, enum: PAPER_DOCUMENT_STATUSES, required: true },
    error: { type: String, maxlength: 300 },
    fileId: { type: String },
    size: { type: Number },
    pageCount: { type: Number },
    truncated: { type: Boolean },
    startedAt: { type: Date },
    indexedAt: { type: Date }
  },
  { timestamps: true, collection: 'paper_documents' }
);

export default mongoose.model<IPaperDocument>('PaperDocument', PaperDocumentSchema);
