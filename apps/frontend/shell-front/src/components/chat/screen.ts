/**
 * The places the chat analyst can open beside the conversation. The analyst names a place and
 * its ids, never an address: this turns the name into a path in Vision, after checking every
 * part. Pages still enforce access themselves, so the worst a request can do is open a page the
 * person could already see. The backend (chat-service `services/screen.ts`) checks the same
 * shapes before it asks; a test keeps the tab names in step with Vision's.
 */
export type ScreenOutcome = { ok: true; path: string; summary: string } | { ok: false; summary: string };

/** Mirrors vision-front's TRAINING_TABS; `screen.test.ts` fails when the two drift. */
export const TRAINING_TABS = [
  'overview',
  'epochs',
  'evaluations',
  'visualizations',
  'models',
  'system-info',
  'config',
  'benchmarks',
  'analysis'
] as const;
export const COMPARE_TABS = ['tests', 'benchmarks'] as const;

const OBJECT_ID = /^[a-f\d]{24}$/i;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const VERSION = /^[a-z0-9][a-z0-9._-]{0,39}$/i;

const isId = (value: unknown): value is string =>
  typeof value === 'string' && (OBJECT_ID.test(value) || UUID.test(value));
const fail = (summary: string): ScreenOutcome => ({ ok: false, summary });
const open = (path: string, summary: string): ScreenOutcome => ({ ok: true, path, summary });

/** The keys a place takes; anything else in a request is refused rather than ignored. */
const KEYS: Record<string, readonly string[]> = {
  projects: [],
  project: ['id'],
  trainings: ['project'],
  training: ['id', 'tab', 'model'],
  compare: ['ids', 'tab'],
  datasets: [],
  dataset: ['id'],
  models: [],
  benchmarks: [],
  evaluation: ['id'],
  suite: ['slug', 'version'],
  visualizations: ['ids'],
  paper: ['id']
};

function ids(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length >= 2 && value.length <= 8 && value.every(isId) ? value : undefined;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' ? allowed.find((a) => a === value) : undefined;
}

export function resolvePlace(request: unknown): ScreenOutcome {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return fail('Not a place');
  const { place, ...rest } = request as Record<string, unknown>;
  if (typeof place !== 'string' || !Object.hasOwn(KEYS, place)) return fail('That place is not available');
  if (Object.keys(rest).some((key) => !KEYS[place].includes(key))) return fail('That request had unexpected details');
  const id = rest.id;
  switch (place) {
    case 'projects':
      return open('/projects', 'Opened projects');
    case 'trainings':
      if (rest.project !== undefined)
        return isId(rest.project)
          ? open(`/projects/${rest.project}?tab=trainings`, `Opened trainings for project ${rest.project}`)
          : fail('The project id is not valid');
      return open('/trainings', 'Opened trainings');
    case 'datasets':
      return open('/datasets', 'Opened datasets');
    case 'models':
      return open('/models', 'Opened models');
    case 'benchmarks':
      return open('/benchmarks', 'Opened benchmarks');
    case 'project':
      return isId(id) ? open(`/projects/${id}`, `Opened project ${id}`) : fail('The project id is not valid');
    case 'dataset':
      return isId(id) ? open(`/datasets/${id}`, `Opened dataset ${id}`) : fail('The dataset id is not valid');
    case 'evaluation':
      return isId(id) ? open(`/evaluations/${id}`, `Opened evaluation ${id}`) : fail('The evaluation id is not valid');
    case 'paper':
      return isId(id) ? open(`/papers/${id}`, `Opened paper ${id}`) : fail('The paper id is not valid');
    case 'training': {
      if (!isId(id)) return fail('The training id is not valid');
      const tab = rest.tab === undefined ? undefined : oneOf(rest.tab, TRAINING_TABS);
      if (rest.tab !== undefined && !tab) return fail('That training tab does not exist');
      if (rest.model !== undefined && !isId(rest.model)) return fail('The model id is not valid');
      const query = [tab && `tab=${tab}`, rest.model && `model=${rest.model as string}`].filter(Boolean).join('&');
      return open(`/trainings/${id}${query ? `?${query}` : ''}`, `Opened training ${id}${tab ? `, ${tab} tab` : ''}`);
    }
    case 'compare': {
      const list = ids(rest.ids);
      if (!list) return fail('Comparing takes 2 to 8 valid training ids');
      const tab = rest.tab === undefined ? undefined : oneOf(rest.tab, COMPARE_TABS);
      if (rest.tab !== undefined && !tab) return fail('That comparison tab does not exist');
      return open(
        `/trainings/compare?ids=${list.join(',')}${tab ? `&tab=${tab}` : ''}`,
        `Opened a comparison of ${list.length} trainings${tab ? `, ${tab} tab` : ''}`
      );
    }
    case 'visualizations': {
      const list = ids(rest.ids);
      if (!list) return fail('Comparing visualizations takes 2 to 8 valid training ids');
      return open(
        `/visualizations/compare-trainings?ids=${list.join(',')}`,
        `Opened the visualizations of ${list.length} trainings`
      );
    }
    default: {
      const { slug, version } = rest;
      if (typeof slug !== 'string' || !SLUG.test(slug) || typeof version !== 'string' || !VERSION.test(version))
        return fail('The suite or its version is not valid');
      return open(`/suites/${slug}/${version}`, `Opened suite ${slug} ${version}`);
    }
  }
}
