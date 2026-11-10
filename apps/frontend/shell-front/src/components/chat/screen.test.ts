import { describe, expect, it } from 'vitest';
import visionTabs from '../../../../vision-front/src/components/training/trainingTabs.ts?raw';
import { COMPARE_TABS, TRAINING_TABS, describePlace, resolvePlace } from './screen';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const UUID = '123e4567-e89b-12d3-a456-426614174000';
const path = (request: unknown) => {
  const outcome = resolvePlace(request);
  return outcome.ok ? outcome.path : `refused: ${outcome.summary}`;
};

it('opens the same tabs a training page does', () => {
  const names = [...visionTabs.matchAll(/\['([a-z-]+)',\s*'[^']+'\]/g)].map((m) => m[1]);
  expect([...TRAINING_TABS]).toEqual(names);
});

describe('places without an id', () => {
  it.each([
    ['projects', '/projects'],
    ['trainings', '/trainings'],
    ['datasets', '/datasets'],
    ['models', '/models'],
    ['benchmarks', '/benchmarks']
  ])('%s', (place, expected) => expect(path({ place })).toBe(expected));
});

describe('places with an id', () => {
  it.each([
    ['project', '/projects/'],
    ['dataset', '/datasets/'],
    ['evaluation', '/evaluations/'],
    ['paper', '/papers/']
  ])('%s takes a Mongo id or a uuid', (place, prefix) => {
    expect(path({ place, id: A })).toBe(`${prefix}${A}`);
    expect(path({ place, id: UUID })).toBe(`${prefix}${UUID}`);
  });
  it('opens only the requested project’s trainings using its existing tab', () => {
    expect(path({ place: 'trainings', project: A })).toBe(`/projects/${A}?tab=trainings`);
    expect(path({ place: 'trainings', project: UUID })).toBe(`/projects/${UUID}?tab=trainings`);
    expect(path({ place: 'trainings', project: '../../admin' })).toMatch(/^refused/);
  });
  it('opens a training, on a tab and a model when asked', () => {
    expect(path({ place: 'training', id: A })).toBe(`/trainings/${A}`);
    expect(path({ place: 'training', id: A, tab: 'epochs' })).toBe(`/trainings/${A}?tab=epochs`);
    expect(path({ place: 'training', id: A, tab: 'system-info', model: B })).toBe(
      `/trainings/${A}?tab=system-info&model=${B}`
    );
  });
  it.each([...TRAINING_TABS])('knows the %s tab', (tab) =>
    expect(path({ place: 'training', id: A, tab })).toBe(`/trainings/${A}?tab=${tab}`)
  );
  it('compares two to eight trainings', () => {
    expect(path({ place: 'compare', ids: [A, B] })).toBe(`/trainings/compare?ids=${A},${B}`);
    for (const tab of COMPARE_TABS)
      expect(path({ place: 'compare', ids: [A, UUID], tab })).toBe(`/trainings/compare?ids=${A},${UUID}&tab=${tab}`);
    expect(path({ place: 'compare', ids: [A] })).toMatch(/^refused/);
    expect(path({ place: 'compare', ids: Array(9).fill(A) })).toMatch(/^refused/);
    expect(path({ place: 'compare', ids: [A, B], tab: 'overview' })).toMatch(/^refused/);
  });
  it('compares visualizations', () => {
    expect(path({ place: 'visualizations', ids: [A, B] })).toBe(`/visualizations/compare-trainings?ids=${A},${B}`);
    expect(path({ place: 'visualizations', ids: [A] })).toMatch(/^refused/);
  });
  it('opens a suite version', () => {
    expect(path({ place: 'suite', slug: 'city-scenes', version: 'v1.2' })).toBe('/suites/city-scenes/v1.2');
  });
});

describe('refuses what is not a place', () => {
  it.each([
    ['a string', 'projects'],
    ['null', null],
    ['an array', ['projects']],
    ['no place', {}],
    ['an unknown place', { place: 'admin' }],
    ['a prototype key', { place: 'constructor' }],
    ['a link', { place: 'https://evil.example.test/' }],
    ['an unexpected detail', { place: 'projects', next: '/x' }],
    ['an id for a place without one', { place: 'trainings', id: A }]
  ])('%s', (_name, request) => expect(path(request)).toMatch(/^refused/));
  it.each([
    'abc',
    '',
    '../../account',
    `${A}/../..`,
    'a'.repeat(23),
    `${A}?x=1`,
    'https://evil.example.test',
    '//evil.example.test',
    7,
    null
  ])('refuses the id %j', (id) => {
    for (const place of ['project', 'training', 'dataset', 'evaluation', 'paper'])
      expect(path({ place, id })).toMatch(/^refused/);
  });
  it('refuses a model, tab or suite part that could change the address', () => {
    expect(path({ place: 'training', id: A, model: 'x&tab=config' })).toMatch(/^refused/);
    expect(path({ place: 'training', id: A, tab: 'epochs&model=1' })).toMatch(/^refused/);
    expect(path({ place: 'suite', slug: '../x', version: '1' })).toMatch(/^refused/);
    expect(path({ place: 'suite', slug: 'a/b', version: '1' })).toMatch(/^refused/);
    expect(path({ place: 'suite', slug: 'a', version: '1?x' })).toMatch(/^refused/);
    expect(path({ place: 'suite', slug: 'a' })).toMatch(/^refused/);
  });
  it('always answers with a path inside Vision, never an outside link', () => {
    const outcome = resolvePlace({ place: 'training', id: A, tab: 'config' });
    expect(outcome.ok && outcome.path.startsWith('/') && !outcome.path.startsWith('//')).toBe(true);
  });
});


describe('describePlace', () => {
  const id = 'a'.repeat(24);
  it('says what opened in words, never an id or an address', () => {
    expect(describePlace('training', { id, tab: 'epochs' })).toBe('the run’s Epochs tab');
    expect(describePlace('training', { id, tab: 'system-info' })).toBe('the run’s System info tab');
    expect(describePlace('training', { id })).toBe('a run');
    expect(describePlace('training', { id, model: id })).toBe('a run’s model');
    expect(describePlace('compare', { ids: [id, id, id] })).toBe('a comparison of 3 runs');
    expect(describePlace('compare', { ids: [id, id], tab: 'benchmarks' })).toBe('a comparison of 2 runs, Benchmarks');
    expect(describePlace('visualizations', { ids: [id, id] })).toBe('the frames of 2 runs');
    expect(describePlace('trainings', { project: id })).toBe('the project’s runs');
    expect(describePlace('trainings', {})).toBe('the runs');
    expect(describePlace('suite', { slug: 'road-scenes', version: '1.0' })).toBe('the road-scenes suite');
    expect(describePlace('action', { action: 'open_frame', id })).toBe('a frame');
    for (const text of [describePlace('training', { id, tab: 'epochs' }), describePlace('compare', { ids: [id, id] })])
      expect(text).not.toContain(id);
  });

  it('has words for every place the analyst can open', () => {
    const named = {
      projects: 'the projects', project: 'a project', datasets: 'the datasets', dataset: 'a dataset', models: 'the models',
      benchmarks: 'the benchmarks', evaluation: 'an evaluation', paper: 'a paper'
    };
    for (const [place, text] of Object.entries(named)) expect(describePlace(place, {})).toBe(text);
  });

  it('copes with anything: a missing count, a missing slug, a stranger, parameters that are not an object', () => {
    expect(describePlace('compare', {})).toBe('a comparison of some runs');
    expect(describePlace('visualizations', undefined)).toBe('the frames of some runs');
    expect(describePlace('suite', {})).toBe('a suite');
    expect(describePlace('somewhere-else', {})).toBe('a page');
    expect(describePlace('training', 'nonsense')).toBe('a run');
    expect(describePlace(undefined, null)).toBe('a page');
  });
});
