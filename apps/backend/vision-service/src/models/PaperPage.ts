import mongoose, { Document, Schema } from 'mongoose';

/**
 * One page of a paper's text, read from its PDF. Kept apart from the paper's document so a long paper cannot outgrow
 * a database record, and so a search or a read touches only the pages it needs.
 */
export interface IPaperPage extends Document {
  paperId: string;
  /** 1-based, as a reader counts them */
  n: number;
  text: string;
}

const PaperPageSchema = new Schema<IPaperPage>(
  {
    paperId: { type: String, required: true },
    n: { type: Number, required: true },
    text: { type: String, default: '' }
  },
  { collection: 'paper_pages' }
);
PaperPageSchema.index({ paperId: 1, n: 1 }, { unique: true });

export default mongoose.model<IPaperPage>('PaperPage', PaperPageSchema);
