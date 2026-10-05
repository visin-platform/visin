import type { Checkpoint, SuiteData, SuiteDataKind } from './providers';
import type { DataTerms } from './license';

export type ValidationState = 'eligible' | 'incomplete' | 'incompatible' | 'exploratory' | 'legacy-unverified';

/** `code` is stable; `detail` says what it is about (`night`, `night/mIoU_foreground`). */
export interface ValidationReason {
  code: string;
  detail?: string;
}

export interface EvaluationScores {
  conditions: Record<string, Record<string, number>>;
  overall: Record<string, number>;
}

/**
 * How much the evaluator reported about what it ran; it labels a result and never decides whether it is ranked.
 * Every level is the submitter's word: `observed` sent complete evidence that matched the suite, `reported` sent
 * less, `attested` is a manager's claim for an old result, `none` is a result with no suite.
 */
export type EvidenceLevel = 'observed' | 'reported' | 'attested' | 'none';

export interface ValidationReport {
  version: number;
  /** absent on reports judged by the first rules */
  evidence?: EvidenceLevel;
  state: ValidationState;
  reasons: ValidationReason[];
  warnings: ValidationReason[];
  /** present when eligible */
  scores?: EvaluationScores;
}

export type { Checkpoint } from './providers';

export type EvaluationEvidence =
  | {
      kind: 'observed';
      data?: { kind: SuiteDataKind; archiveSha256?: string; repo?: string; commit?: string; manifestSha256?: string };
      protocolDigest?: string;
      evaluator?: { package: string; version: string };
      classes?: { scored: string[]; ignored: string[] };
    }
  | { kind: 'attested'; by: string; at: string; evaluationId: string; claims: { checkpoint?: Checkpoint; sampleCounts?: Record<string, number> } };

export interface Evaluation {
  _id: string;
  uuid: string;
  projectId: string;
  /** who recorded it; absent when the viewer can only see what was published */
  ownerId?: string;
  checkpoint?: Checkpoint;
  checkpointKey?: string;
  source?: { trainingId?: string; epochUuid?: string; epoch?: number; evaluationId?: string };
  suite?: { id: string; slug: string; version: number; digest: string };
  status: 'completed' | 'failed';
  sampleCounts?: Record<string, number>;
  evidence?: EvaluationEvidence;
  executedAt?: string;
  receivedAt: string;
  validation: ValidationReport;
  /** when a manager put it on its suite's public leaderboard; absent when it is not there */
  publishedAt?: string;
  /** Verified by a manager or an automated job. */
  verifiedAt?: string;
  verifiedBy?: string;
  /** taken off the suite's leaderboard by one of its managers */
  hidden?: { at: string; reason?: string };
  supersedesId?: string;
  /** the live correction that replaces it: it is never ranked or published again */
  supersededById?: string;
  createdAt: string;
  /** only on a single evaluation */
  results?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

export interface EvaluationQuery {
  projectId?: string;
  suite?: string;
  state?: ValidationState;
  page?: number;
  limit?: number;
}

export interface EvaluationPage {
  evaluations: Evaluation[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface PromoteRequest {
  /** the evaluation to copy: it is not changed */
  evaluationId: string;
  /** `slug@version` */
  suite: string;
  checkpoint: Checkpoint;
  sampleCounts: Record<string, number>;
}

export interface SuiteProtocol {
  task: string;
  data: SuiteData;
  split: string;
  annotationVersion?: string;
  conditions: { name: string; sampleCount: number }[];
  classes: { id: string; name?: string }[];
  ignoredClasses: string[];
  metrics: { key: string; direction: 'max' | 'min'; unit?: string; range?: { min: number; max: number }; headline?: boolean }[];
  aggregation: 'equal-mean-of-conditions' | 'sample-weighted-mean' | 'pooled';
  input: { sensors?: string[]; resolution?: string; preprocessing?: string; postprocessing?: string; calibration?: string };
  evaluator: { package: string; minVersion?: string };
}

export type SubmissionPolicy = 'open' | 'members' | 'approval';

/** A published result as a manager of the suite sees another project's: only what the public sees. */
export interface Submission {
  evaluationId: string;
  checkpoint?: PublicCheckpoint;
  project?: { name: string; slug?: string };
  headline?: { key: string; value: number; unit?: string };
  publishedAt?: string;
  hidden?: { at: string; reason?: string };
}

export interface SuiteSubmissions {
  suite: { slug: string; version: number; submissions: SubmissionPolicy };
  pending: Submission[];
  hidden: Submission[];
}

export interface Suite {
  _id: string;
  slug: string;
  version: number;
  name: string;
  description?: string;
  projectId: string;
  visibility: 'private' | 'public';
  /** who may publish results to its public leaderboard */
  submissions: SubmissionPolicy;
  /** what the publisher says the evaluated data is licensed under; absent means unstated */
  dataTerms?: DataTerms;
  createdBy: string;
  protocol: SuiteProtocol;
  digest: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SuitePage {
  suites: Suite[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface LeaderboardEntry {
  evaluationId: string;
  uuid: string;
  checkpointKey: string;
  checkpoint?: Checkpoint;
  rank: number;
  attempts: number;
  evidenceLevel?: EvidenceLevel;
  project?: { _id: string; name: string; slug?: string };
  receivedAt: string;
  summary: {
    headline: { key: string; value: number; direction: 'max' | 'min'; unit?: string };
    worst: { condition: string; value: number };
    gap: number;
  };
}

export interface UnrankedEntry {
  evaluationId: string;
  uuid: string;
  checkpointKey: string;
  checkpoint?: Checkpoint;
  state: ValidationState;
  attempts: number;
  reasons: ValidationReason[];
  project?: { _id: string; name: string; slug?: string };
  receivedAt: string;
}

export interface Leaderboard {
  suite: { slug: string; version: number; name: string; digest: string; headline: { key: string; direction: 'max' | 'min'; unit?: string } };
  selection: 'latest-eligible-completed';
  scope: { candidates: number; truncated: boolean };
  entries: LeaderboardEntry[];
  unranked: UnrankedEntry[];
  pagination: LeaderboardPagination;
  unrankedPagination: LeaderboardPagination;
}

/** The public views: a fixed set of fields, the same for everyone. */
export type PublicCheckpoint = Checkpoint;

export interface PublicSuite {
  slug: string;
  version: number;
  name: string;
  description?: string;
  digest: string;
  archived?: true;
  task: string;
  split: string;
  data: { kind: SuiteDataKind; repo?: string; commit?: string; label?: string };
  /** absent means the publisher has not said what the data may be used for */
  dataTerms?: DataTerms;
  conditions: { name: string; sampleCount: number }[];
  headline: { key: string; direction: 'max' | 'min'; unit?: string };
  aggregation: 'equal-mean-of-conditions' | 'sample-weighted-mean' | 'pooled';
  evaluator: { package: string; minVersion?: string };
}

export interface PublicLeaderboardListItem extends PublicSuite {
  checkpoints: number;
  lastPublishedAt: string;
}

export interface PublicLeaderboardEntry {
  rank: number;
  evaluationId: string;
  checkpoint?: PublicCheckpoint;
  headline: number;
  worst: { condition: string; value: number };
  gap: number;
  conditions: Record<string, number>;
  attempts: number;
  evidenceLevel?: EvidenceLevel;
  project?: { name: string; slug?: string };
  executedAt?: string;
  publishedAt: string;
  verifiedAt?: string;
}

export interface PublicLeaderboard {
  suite: PublicSuite;
  selection: 'latest-eligible-completed';
  scope: { candidates: number };
  evidence: 'submitter-reported';
  generatedAt: string;
  entries: PublicLeaderboardEntry[];
  pagination: LeaderboardPagination;
}

export interface PublicEvaluation {
  evaluationId: string;
  suite: PublicSuite;
  checkpoint?: PublicCheckpoint;
  scores?: EvaluationScores;
  sampleCounts?: Record<string, number>;
  evaluator?: { package?: string; version?: string; commit?: string };
  project?: { name: string; slug?: string };
  evidence: 'submitter-reported';
  evidenceLevel?: EvidenceLevel;
  executedAt?: string;
  publishedAt: string;
  verifiedAt?: string;
}

export interface LeaderboardPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface LeaderboardPageQuery {
  page?: number;
  limit?: number;
  unrankedPage?: number;
  /** rank only the results whose evaluator sent complete evidence */
  evidence?: 'observed';
}

export interface PublicLeaderboardListPage {
  leaderboards: PublicLeaderboardListItem[];
  pagination: LeaderboardPagination;
}

export interface RecordedLeaderboardQuery {
  verification?: 'all' | 'verified' | 'unverified';
  metric?: string;
  direction?: 'max' | 'min';
  projectId?: string;
  page?: number;
  limit?: number;
}

export interface RecordedLeaderboardPage {
  metric?: string;
  metrics: string[];
  direction: 'max' | 'min';
  verification: 'all' | 'verified' | 'unverified';
  entries: {
    rank: number;
    evaluationId: string;
    checkpoint?: Checkpoint;
    project: { id: string; name: string; slug?: string };
    run?: { id: string; name: string };
    dataset?: string;
    epoch?: number;
    value: number;
    verified: boolean;
    receivedAt: string;
  }[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
