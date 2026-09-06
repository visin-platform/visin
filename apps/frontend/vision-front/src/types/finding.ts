/**
 * A run a finding draws on, named.
 *
 * Resolved by vision-service rather than looked up here: the panel shows a
 * dozen findings at once and each cites several runs, so doing it in the client
 * is a fan of requests to render one card.
 *
 * A run the reader cannot see is left out of this list but still counted in
 * `trainingIds` — so the two lengths differing is meaningful, not a bug.
 */
export interface CitedTraining {
  _id: string;
  name: string;
  status: string;
}

/** A written conclusion about a project or a run. */
export interface Finding {
  _id: string;
  projectId: string;
  trainingId?: string;
  title: string;
  /** markdown */
  body: string;
  /**
   * What to change for the next run.
   *
   * Apart from `body` because the two have different readers: the body is the
   * result and can go into a paper, this is a note to whoever launches the next
   * run. The LaTeX export writes it out commented for that reason.
   */
  recommendations?: string;
  /** the runs the conclusion draws on, so a reader can check it */
  trainingIds: string[];
  /**
   * The same runs, named — minus any the reader may not see.
   *
   * Optional only because this front and vision-service deploy independently,
   * so a front that ships first will briefly talk to an API that does not send
   * it. Treating that as `[]` degrades to the old "draws on N runs" line; not
   * guarding it would take out the whole Analysis tab for the window.
   */
  citedTrainings?: CitedTraining[];
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
  recommendations?: string;
  trainingIds?: string[];
}

/** How the exported table picks the epoch each cited run is reported at. */
export interface ExportFindingOptions {
  selectBy?: string;
  direction?: 'max' | 'min';
}

export interface FindingExport {
  filename: string;
  tex: string;
}
