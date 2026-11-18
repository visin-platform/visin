/**
 * The tabs of a project's page, in the order they are shown. The address names them (`?tab=models`), and each tab is
 * known by that name everywhere, never by its position: positions shift when Settings is hidden, and two tables of
 * indices once drifted apart.
 */
export const PROJECT_TAB_KEYS = [
  'overview',
  'trainings',
  'evaluations',
  'visualizations',
  'benchmarks',
  'comparisons',
  'analysis',
  'models',
  'settings'
] as const;

export type ProjectTabKey = (typeof PROJECT_TAB_KEYS)[number];

/** Whether every run of the project is an inference run (and it has one). */
export const isInferenceProject = (stats: { totalTrainings?: number; inferenceTrainings?: number } | undefined): boolean =>
  Boolean(stats?.totalTrainings && stats.inferenceTrainings === stats.totalTrainings);

/**
 * The tabs a project of inference runs only cannot fill: a model's pass over a frame set has no epochs to compare,
 * no stored models and, unless something was sent there, no visualizations or benchmarks. Decided by what the
 * project holds, never by its task type, which only seeds presets.
 */
export function hiddenProjectTabs(
  stats: { totalTrainings?: number; inferenceTrainings?: number } | undefined,
  counts: { visualizationsCount?: number; benchmarksCount?: number } | undefined
): Set<ProjectTabKey> {
  if (!isInferenceProject(stats)) return new Set();
  const hidden = new Set<ProjectTabKey>(['comparisons', 'models']);
  if (!counts?.visualizationsCount) hidden.add('visualizations');
  if (!counts?.benchmarksCount) hidden.add('benchmarks');
  return hidden;
}


/** The tab an address asks for, or the overview: for a name we do not know, and for Settings without `manage`. */
export function resolveProjectTab(requested: string | null, canManage: boolean): ProjectTabKey {
  const key = PROJECT_TAB_KEYS.find((candidate) => candidate === requested);
  if (!key) return 'overview';
  return key === 'settings' && !canManage ? 'overview' : key;
}
