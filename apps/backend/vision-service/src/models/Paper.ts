import mongoose, { Document, Schema, Types } from 'mongoose';
import { VISIBILITIES, type ResourceOwner, type Visibility } from '@visin/backend-core';

/**
 * One name on a paper's author list, as the paper prints it. `userId` links it to a Visin account, but only once that
 * person has said so: `confirmedAt` is set when they accept (or when they are the one who linked themselves), so no
 * one can put another person's profile on a paper they never saw.
 */
export interface IPaperAuthor {
  name: string;
  userId?: string;
  confirmedAt?: Date;
}

/**
 * What a paper cites on Visin. `ref` is a project id, a run id, or `slug@version` for a leaderboard; `projectId` is the
 * project it belongs to, kept so a project can find the papers that cite it. Whether it is still public is decided when
 * the paper is read, never stored: a result made private is a result no longer shown.
 */
export const PAPER_RESULT_KINDS = ['project', 'training', 'leaderboard'] as const;
export type PaperResultKind = (typeof PAPER_RESULT_KINDS)[number];

export interface IPaperResult {
  kind: PaperResultKind;
  ref: string;
  projectId: string;
  /** where in the paper it is used: "Table 2" */
  note?: string;
}

/**
 * A research paper whose results (or whose claims) rest on Visin. The paper itself lives elsewhere (arXiv, a
 * publisher): this is its address card, who wrote it, and which recorded results it points at.
 *
 * It has an owner and a visibility like a project, and the same trash.
 */
export interface IPaper extends Document {
  _id: Types.ObjectId;
  title: string;
  abstract?: string;
  authors: IPaperAuthor[];
  venue?: string;
  year?: number;
  /** normalised: `2401.01234`, without a version, a prefix or an address */
  arxivId?: string;
  /** normalised: lowercase, without `https://doi.org/` */
  doi?: string;
  /** the publisher's or author's page for the paper */
  url?: string;
  pdfUrl?: string;
  tags: string[];
  results: IPaperResult[];
  /** the projects `results` belong to, derived on every save */
  projectIds: string[];
  /** accounts that turned down being linked as an author, so the paper's owner cannot ask them again */
  declinedUserIds: string[];
  owner: ResourceOwner;
  /** attribution only: never changes and grants nothing */
  createdBy: string;
  visibility: Visibility;
  trashedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OwnerSchema = new Schema<ResourceOwner>(
  {
    kind: { type: String, enum: ['user', 'group'], required: true },
    id: { type: String, required: true }
  },
  { _id: false }
);

const AuthorSchema = new Schema<IPaperAuthor>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    userId: { type: String },
    confirmedAt: { type: Date }
  },
  { _id: false }
);

const ResultSchema = new Schema<IPaperResult>(
  {
    kind: { type: String, enum: PAPER_RESULT_KINDS, required: true },
    ref: { type: String, required: true, maxlength: 200 },
    projectId: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 200 }
  },
  { _id: false }
);

const PaperSchema = new Schema<IPaper>(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    abstract: { type: String, trim: true, maxlength: 5000 },
    authors: { type: [AuthorSchema], default: [] },
    venue: { type: String, trim: true, maxlength: 200 },
    year: { type: Number, min: 1900, max: 2100 },
    arxivId: { type: String, maxlength: 40 },
    doi: { type: String, maxlength: 200 },
    url: { type: String, maxlength: 500 },
    pdfUrl: { type: String, maxlength: 500 },
    tags: { type: [String], default: [] },
    results: { type: [ResultSchema], default: [] },
    projectIds: { type: [String], default: [] },
    declinedUserIds: { type: [String], default: [] },
    owner: { type: OwnerSchema, required: true },
    createdBy: { type: String, required: true },
    visibility: { type: String, enum: VISIBILITIES, default: 'private' },
    trashedAt: { type: Date }
  },
  { timestamps: true }
);

PaperSchema.index({ visibility: 1, trashedAt: 1, createdAt: -1, _id: -1 });
PaperSchema.index({ visibility: 1, trashedAt: 1, year: -1, createdAt: -1 });
PaperSchema.index({ 'owner.kind': 1, 'owner.id': 1, trashedAt: 1 });
// A profile's papers, and what a person is asked to confirm.
PaperSchema.index({ 'authors.userId': 1 }, { sparse: true });
// A project's "cited in".
PaperSchema.index({ projectIds: 1 });
PaperSchema.index({ arxivId: 1 }, { sparse: true });
PaperSchema.index({ doi: 1 }, { sparse: true });
PaperSchema.index({ trashedAt: 1 }, { sparse: true });
PaperSchema.index(
  { title: 'text', abstract: 'text', tags: 'text', venue: 'text', 'authors.name': 'text' },
  { weights: { title: 10, 'authors.name': 6, tags: 5, venue: 3, abstract: 1 } }
);

export default mongoose.model<IPaper>('Paper', PaperSchema);
