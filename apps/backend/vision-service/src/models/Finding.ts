import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * A written conclusion about a project or a run.
 *
 * Called a Finding rather than an Analysis because `/api/analysis` already
 * belongs to DatasetAnalysis — the uploaded artefacts describing a dataset —
 * and two things called analysis in one service is a trap for whoever reads it
 * next. The UI calls these "Analysis", which is the word people use.
 *
 * The point of storing them is that an assistant's reasoning currently
 * evaporates: it can work out that window16 beats window24 on ZOD but not on
 * WAYMO, say so once, and leave nothing behind. A finding is where that lands
 * so the next person — or the next conversation — starts from it.
 */
export interface IFinding extends Document {
  _id: Types.ObjectId;
  /** the project it belongs to; always set, and what access is decided by */
  projectId: string;
  /**
   * The run it is about, when it is about one.
   *
   * Optional because the interesting conclusions are often comparative — "the
   * window ablation plateaus past 16" is about a dozen runs and belongs to the
   * project rather than to any one of them.
   */
  trainingId?: string;
  title: string;
  /** markdown; rendered in the app, handed to the model as-is */
  body: string;
  /**
   * What to change on the next run, if the finding suggests anything.
   *
   * Kept apart from `body` rather than written into it because the two have
   * different readers. The body is the result and can go into a paper; this is
   * a note to whoever launches the next run, and a reviewer should never see
   * it. The LaTeX export writes it out commented for exactly that reason.
   */
  recommendations?: string;
  /**
   * Which runs the conclusion draws on.
   *
   * Recorded so a reader can check the work, and so a finding can be found
   * again from a run rather than only from its project.
   */
  trainingIds: string[];
  /** whether a person wrote this or an assistant did — shown, never inferred */
  authorKind: 'person' | 'assistant';
  /** the assistant's name or the person's, as its owner would recognise it */
  authorLabel: string;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const FindingSchema = new Schema<IFinding>(
  {
    projectId: { type: String, required: true },
    trainingId: { type: String },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Capped generously but capped: an assistant asked for "a summary" can
    // produce an essay, and an unbounded field is one bad prompt from a
    // document nobody will read stored forever.
    body: { type: String, required: true, maxlength: 20_000 },
    recommendations: { type: String, maxlength: 5_000 },
    trainingIds: { type: [String], default: [] },
    authorKind: { type: String, required: true, enum: ['person', 'assistant'] },
    authorLabel: { type: String, required: true },
    authorUserId: { type: String, required: true },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true, collection: 'findings' }
);

// Every listing is one project's findings, newest first.
FindingSchema.index({ projectId: 1, createdAt: -1 });
// And the other way in: what has been concluded about this run.
FindingSchema.index({ trainingIds: 1, createdAt: -1 });

export const Finding = mongoose.models.Finding
  ? (mongoose.models.Finding as mongoose.Model<IFinding>)
  : mongoose.model<IFinding>('Finding', FindingSchema);

export default Finding;
