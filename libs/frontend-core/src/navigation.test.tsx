import { describe, it, expect } from 'vitest';
import { createVisinNavigation } from './navigation';

const urls = { vision: 'https://vision.test', label: 'https://label.test', account: 'https://account.test' };

const labels = (nav: ReturnType<typeof createVisinNavigation>) => nav.groups.map(group => group.label);
const texts = (nav: ReturnType<typeof createVisinNavigation>) =>
  nav.groups.map(group => group.items.map(item => item.text));

describe('createVisinNavigation', () => {
  it('gives every app the same groups, in the same order', () => {
    const expected = [['All projects', 'Trainings'], ['Datasets'], ['Jobs', 'Bundles']];

    // Crossing apps must not change what the menu contains.
    for (const local of ['vision', 'label', 'account', null] as const) {
      const nav = createVisinNavigation(local, urls);
      expect(labels(nav)).toEqual(['Projects', 'Data', 'Labels']);
      expect(texts(nav)).toEqual(expected);
    }
  });

  it('keeps bundles beside the jobs labelled from them', () => {
    const group = createVisinNavigation('vision', urls).groups.find(candidate => candidate.label === 'Labels')!;

    expect(group.items).toMatchObject([{ href: 'https://label.test/jobs' }, { href: 'https://label.test/bundles' }]);
  });

  it('keeps the current app sections as internal routes', () => {
    const [projects] = createVisinNavigation('vision', urls).groups[0].items;
    const [jobs] = createVisinNavigation('label', urls).groups[2].items;

    expect(projects.path).toBe('/projects');
    expect(projects.href).toBeUndefined();
    expect(jobs.path).toBe('/jobs');
    expect(jobs.href).toBeUndefined();
  });

  it('links the other app sections straight to that section', () => {
    const nav = createVisinNavigation('label', urls);
    const [datasets] = nav.groups[1].items;
    const [, bundles] = nav.groups[2].items;

    expect(datasets.href).toBe('https://vision.test/datasets');
    expect(datasets.path).toBeUndefined();
    expect(bundles.path).toBe('/bundles');
    expect(bundles.href).toBeUndefined();
  });

  it('tolerates a trailing slash on the configured base URL', () => {
    const nav = createVisinNavigation('vision', { label: 'https://label.test/' });

    expect(nav.groups[2].items[0]).toMatchObject({ href: 'https://label.test/jobs' });
  });

  it('omits sections, and then groups, whose app has no URL configured', () => {
    // Dead links into the current origin would 404; an absent entry is honest.
    expect(texts(createVisinNavigation('vision', {}))).toEqual([['All projects', 'Trainings'], ['Datasets']]);
    expect(texts(createVisinNavigation('label', {}))).toEqual([['Jobs', 'Bundles']]);
    expect(labels(createVisinNavigation(null, { label: 'https://label.test' }))).toEqual(['Labels']);
  });

  it('keeps Projects lit on the pages a project leads to, only where they are local', () => {
    expect(createVisinNavigation('vision', urls).groups[0].match).toContain('/benchmarks');
    expect(createVisinNavigation('label', urls).groups[0].match).toEqual([]);
    expect(createVisinNavigation('vision', urls).groups[1].match).toEqual([]);
  });

  // shell-front renders every app on one page, so nothing links across.
  it('routes every listed app locally when several share the page', () => {
    const nav = createVisinNavigation(['vision', 'label', 'account'], {});
    const items = [...nav.groups.flatMap(group => group.items), ...nav.accountItems];

    expect(items.every(item => item.path !== undefined && item.href === undefined)).toBe(true);
  });

  it('ignores the current app own URL', () => {
    const nav = createVisinNavigation('vision', { vision: 'https://vision.test' });

    expect(nav.groups[0].items.every(item => item.path !== undefined)).toBe(true);
  });
});

describe('account items', () => {
  const sections = ['Profile', 'Groups', 'API keys', 'Connected apps', 'Assistant activity'];

  it('are local routes in the app that serves Account', () => {
    const { accountItems } = createVisinNavigation('account', urls);

    expect(accountItems.map(item => item.text)).toEqual(sections);
    expect(accountItems.every(item => item.path?.startsWith('/account/'))).toBe(true);
  });

  it('link to account-front from anywhere else', () => {
    const { accountItems } = createVisinNavigation('vision', urls);

    expect(accountItems[0]).toMatchObject({ href: 'https://account.test/account/profile' });
  });

  it('are absent when account-front is unconfigured', () => {
    expect(createVisinNavigation('vision', {}).accountItems).toEqual([]);
  });
});
