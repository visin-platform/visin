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

/** The tab an address asks for, or the overview: for a name we do not know, and for Settings without `manage`. */
export function resolveProjectTab(requested: string | null, canManage: boolean): ProjectTabKey {
  const key = PROJECT_TAB_KEYS.find((candidate) => candidate === requested);
  if (!key) return 'overview';
  return key === 'settings' && !canManage ? 'overview' : key;
}
