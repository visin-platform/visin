import { entityId, TRAINING_TABS, COMPARE_TABS, PROJECT_TABS } from './screen';

/** What the address of the page beside the chat says it shows. Every id still has to be verified before use. */
export type PageContext =
  | { place: 'training'; trainingIds: [string]; tab: string }
  | { place: 'compare'; trainingIds: string[]; tab: string }
  | { place: 'visualizations'; trainingIds: string[] }
  | { place: 'project'; projectId: string; tab: string };

const isId = (value: string) => entityId.safeParse(value).success;
const oneOf = (value: string | null, allowed: readonly string[], fallback: string) =>
  value === null ? fallback : allowed.includes(value) ? value : undefined;
/** 2 to 8 distinct, well-formed run ids, as the comparison pages take them. */
function runIds(value: string | null) {
  const ids = value?.split(',');
  if (!ids || ids.length < 2 || ids.length > 8 || !ids.every(isId)) return undefined;
  const unique = [...new Set(ids)];
  return unique.length >= 2 ? unique : undefined;
}

/** A browser path is a hint, never authority to widen the analyst's project-scoped credential. */
export function pageContext(path?: string | null): PageContext | undefined {
  if (!path || path.length > 500 || !path.startsWith('/') || path.startsWith('//') || path.includes('#')) return;
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  if (pathname === '/trainings/compare') {
    const trainingIds = runIds(params.get('ids'));
    const tab = oneOf(params.get('tab'), COMPARE_TABS, 'training-runs');
    return trainingIds && tab ? { place: 'compare', trainingIds, tab } : undefined;
  }
  if (pathname === '/visualizations/compare-trainings') {
    const trainingIds = runIds(params.get('ids'));
    return trainingIds ? { place: 'visualizations', trainingIds } : undefined;
  }
  const training = /^\/trainings\/([^/]+)$/.exec(pathname);
  if (training && isId(training[1])) {
    const tab = oneOf(params.get('tab'), TRAINING_TABS, 'overview');
    return tab ? { place: 'training', trainingIds: [training[1]], tab } : undefined;
  }
  const project = /^\/projects\/([^/]+)$/.exec(pathname);
  if (project && isId(project[1])) {
    const tab = oneOf(params.get('tab'), PROJECT_TABS, 'overview');
    return tab ? { place: 'project', projectId: project[1], tab } : undefined;
  }
  return undefined;
}
