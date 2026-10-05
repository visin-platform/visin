import mongoose, { Document, Schema } from 'mongoose';
import type { SuiteProtocol } from '../validation/suiteSchemas';
import type { DeclaredLicense } from '@visin/backend-core';

/**
 * Who may put results on a suite's public leaderboard. `open`: a manager of any public project. `members`: only the
 * project that owns the suite. `approval`: any public project; managers review unverified results.
 * Verification is a label and never a visibility gate.
 */
export const SUBMISSION_POLICIES = ['open', 'members', 'approval'] as const;
export type SubmissionPolicy = (typeof SUBMISSION_POLICIES)[number];

/**
 * What the publisher says about the data a suite scores: its licence, where it lives, and the credit it asks for.
 * A declaration shown beside the results, never part of the protocol: it has no bearing on what a score means, so
 * fixing a wrong one does not make a new version. Visin holds no copy of the data, only these words about it.
 */
export interface SuiteDataTerms {
  license?: DeclaredLicense;
  /** the data's own home: where a reader gets it, and agrees to its terms */
  sourceUrl?: string;
  credit?: string;
}

/**
 * One published version of an evaluation suite: a scoring protocol that is frozen once it exists.
 *
 * A suite follows its project, like everything else in one: who may read or change it is decided by that
 * project, plus `visibility` for a suite meant to be used beyond it. The `slug` is one name per deployment,
 * so a leaderboard's address is `/leaderboards/<slug>/<version>`; every version of a slug belongs to the
 * project that first used it.
 */
export interface ISuite extends Document {
  slug: string;
  /** 1, 2, 3...: a new number for any change to what a score means */
  version: number;
  name: string;
  description?: string;
  projectId: string;
  visibility: 'private' | 'public';
  /** who may publish results to its public leaderboard; changing it never touches results already published */
  submissions: SubmissionPolicy;
  /** who published it: attribution, and what lets a contributor change their own */
  createdBy: string;
  /** what the publisher says the evaluated data is licensed under; absent means unstated */
  dataTerms?: SuiteDataTerms;
  /** immutable once published; its `digest` is the identity of the protocol */
  protocol: SuiteProtocol;
  /** SHA-256 of the canonical protocol, so two suites with one digest score identically */
  digest: string;
  /** set to stop new evaluations; the suite and every result on it stay readable */
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SuiteSchema = new Schema<ISuite>(
  {
    slug: { type: String, required: true, immutable: true },
    version: { type: Number, required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    projectId: { type: String, required: true, immutable: true, index: true },
    visibility: { type: String, enum: ['private', 'public'], default: 'private', index: true },
    submissions: { type: String, enum: SUBMISSION_POLICIES, default: 'open' },
    createdBy: { type: String, required: true, immutable: true },
    // Validated on the way in (`dataTermsSchema`); nothing queries inside it.
    dataTerms: { type: Schema.Types.Mixed },
    protocol: { type: Schema.Types.Mixed, required: true, immutable: true },
    digest: { type: String, required: true, immutable: true },
    archivedAt: { type: Date }
  },
  { timestamps: true }
);

// One protocol per (slug, version): concurrent publishes of the same number cannot both win.
SuiteSchema.index({ slug: 1, version: 1 }, { unique: true });
SuiteSchema.index({ digest: 1 });

export default mongoose.model<ISuite>('suite', SuiteSchema);
