/** A written conclusion about a project or a run. */
export interface Finding {
  _id: string;
  projectId: string;
  trainingId?: string;
  title: string;
  /** markdown */
  body: string;
  /** the runs the conclusion draws on, so a reader can check it */
  trainingIds: string[];
  /** shown, never inferred — a reader should know whether software wrote this */
  authorKind: 'person' | 'assistant';
  authorLabel: string;
  createdAt: string;
}

export interface CreateFindingRequest {
  project: string;
  training?: string;
  title: string;
  body: string;
  trainingIds?: string[];
}
