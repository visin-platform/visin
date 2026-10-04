import { getEditableProjectIds, getVisibleProjectIds } from './projectAccessService';

/**
 * What a caller may see of evaluations, project by project.
 *
 * In a project they can add to, everything. In a project they can only read (a public project they are not part of),
 * what a public project shows of its runs, and nothing it has not chosen to show: a test a run reported (a result with
 * no suite) is part of the run, which the project shows; a result judged on a suite is shown once a manager published it,
 * since publishing is the decision to put it before the world and a public project does not publish by existing. Never
 * who recorded it or how the run was set up.
 */
export interface EvaluationScope {
  /** projects whose evaluations the caller may see in full */
  full: string[];
  /** projects whose published evaluations the caller may see, redacted */
  published: string[];
}

export async function evaluationScope(userId: string | undefined): Promise<EvaluationScope> {
  const readable = await getVisibleProjectIds(userId);
  const editable = new Set(await getEditableProjectIds(userId));
  return { full: readable.filter((id) => editable.has(id)), published: readable.filter((id) => !editable.has(id)) };
}

/** The filter for what someone who can only read a project is shown of it: its runs' tests, and what was published. */
export const readerVisible = { $or: [{ publishedAt: { $ne: null } }, { suite: { $exists: false } }] };

/** Whether someone who can only read a project is shown this evaluation of it. */
export const visibleToReader = (evaluation: { publishedAt?: Date | null; suite?: unknown }): boolean =>
  Boolean(evaluation.publishedAt) || !evaluation.suite;

/** The projects named in a scope, whichever way they may be seen. */
export const scopeProjectIds = (scope: EvaluationScope): string[] => [...scope.full, ...scope.published];
