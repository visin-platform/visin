import { entityId, TRAINING_TABS, COMPARE_TABS, PROJECT_TABS } from './screen';

/** What the address of the page beside the chat says it shows. Every id still has to be verified before use. */
export type PageContext =
  | { place: 'training'; trainingIds: [string]; tab: string; frame?: string }
  | { place: 'compare'; trainingIds: string[]; tab: string }
  | { place: 'visualizations'; trainingIds: string[] }
  | { place: 'project'; projectId: string; tab: string }
  | { place: 'paper'; paperId: string }
  | { place: 'dataset'; datasetId: string }
  | { place: 'suite'; slug: string; version: number }
  | { place: 'evaluation'; evaluationId: string };

const isId = (value: string) => entityId.safeParse(value).success;
/** A visualization's id as vision gives it. Only its shape is checked here; the frame tools check access to it. */
const FRAME_ID = /^[A-Za-z0-9_-]{8,64}$/;
const oneOf = (value: string | null, allowed: readonly string[], fallback: string) =>
  value === null ? fallback : allowed.includes(value) ? value : undefined;
/** 2 to 8 distinct, well-formed run ids, as the comparison pages take them. */
function runIds(value: string | null) {
  const ids = value?.split(',');
  if (!ids || ids.length < 2 || ids.length > 8 || !ids.every(isId)) return undefined;
  const unique = [...new Set(ids)];
  return unique.length >= 2 ? unique : undefined;
}

/** A suite's slug as its address carries it; the suite is read by this and checked as the person, so only the shape is judged here. */
const SUITE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/**
 * A browser path is a hint, never authority: whatever it names is read again as the person asking, so a path for
 * something they may not read comes back unverified and is never named.
 */
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
    // The image open on the Visualizations tab (vision-front keeps it in `frame=`).
    const frame = params.get('frame');
    return tab
      ? {
          place: 'training',
          trainingIds: [training[1]],
          tab,
          ...(tab === 'visualizations' && frame && FRAME_ID.test(frame) ? { frame } : {})
        }
      : undefined;
  }
  const project = /^\/projects\/([^/]+)$/.exec(pathname);
  if (project && isId(project[1])) {
    const tab = oneOf(params.get('tab'), PROJECT_TABS, 'overview');
    return tab ? { place: 'project', projectId: project[1], tab } : undefined;
  }
  const paper = /^\/papers\/([^/]+)$/.exec(pathname);
  if (paper && isId(paper[1])) return { place: 'paper', paperId: paper[1] };
  const dataset = /^\/datasets\/([^/]+)$/.exec(pathname);
  if (dataset && isId(dataset[1])) return { place: 'dataset', datasetId: dataset[1] };
  const evaluation = /^\/evaluations\/([^/]+)$/.exec(pathname);
  if (evaluation && isId(evaluation[1])) return { place: 'evaluation', evaluationId: evaluation[1] };
  // A suite and its public leaderboard are the same thing to read: the suite's ranking.
  const suite = /^\/(?:suites|leaderboards)\/([^/]+)\/(\d{1,6})(?:\/(?:compare|judges))?$/.exec(pathname);
  if (suite && SUITE_SLUG.test(suite[1])) return { place: 'suite', slug: suite[1], version: Number(suite[2]) };
  return undefined;
}
