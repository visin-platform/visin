import { describe, it, expect } from 'vitest';
import { createVisinNavItems } from './navigation';

const urls = { vision: 'https://vision.test', label: 'https://label.test' };

describe('createVisinNavItems', () => {
  it('gives every app the same menu, in the same order', () => {
    const texts = (items: ReturnType<typeof createVisinNavItems>) => items.map(item => item.text);
    const expected = ['Projects', 'Trainings', 'Datasets', 'Jobs', 'Bundles'];

    // Crossing apps must not change what the menu contains.
    expect(texts(createVisinNavItems('vision', urls))).toEqual(expected);
    expect(texts(createVisinNavItems('label', urls))).toEqual(expected);
    expect(texts(createVisinNavItems(null, urls))).toEqual(expected);
  });

  it('files each section under its app heading', () => {
    expect(createVisinNavItems('vision', urls).map(item => item.group)).toEqual([
      'Vision',
      'Vision',
      'Vision',
      'Labeling',
      'Labeling'
    ]);
  });

  it('keeps the current app sections as internal routes', () => {
    const projects = createVisinNavItems('vision', urls).find(item => item.text === 'Projects');
    const jobs = createVisinNavItems('label', urls).find(item => item.text === 'Jobs');

    expect(projects?.path).toBe('/projects');
    expect(projects?.href).toBeUndefined();
    expect(jobs?.path).toBe('/jobs');
    expect(jobs?.href).toBeUndefined();
  });

  it('links the other app sections straight to that section', () => {
    const bundles = createVisinNavItems('vision', urls).find(item => item.text === 'Bundles');
    const datasets = createVisinNavItems('label', urls).find(item => item.text === 'Datasets');

    expect(bundles?.href).toBe('https://label.test/bundles');
    expect(bundles?.path).toBeUndefined();
    expect(datasets?.href).toBe('https://vision.test/datasets');
    expect(datasets?.path).toBeUndefined();
  });

  it('links every section across for an app that owns none of them', () => {
    const items = createVisinNavItems(null, urls);

    expect(items.every(item => item.href !== undefined)).toBe(true);
    expect(items[0]).toMatchObject({ href: 'https://vision.test/projects' });
  });

  it('tolerates a trailing slash on the configured base URL', () => {
    const items = createVisinNavItems('vision', { label: 'https://label.test/' });

    expect(items.find(item => item.text === 'Jobs')).toMatchObject({ href: 'https://label.test/jobs' });
  });

  it('omits a sibling app group when that app has no URL configured', () => {
    // Dead links into the current origin would 404; an absent group is honest.
    expect(createVisinNavItems('vision', {}).map(item => item.text)).toEqual(['Projects', 'Trainings', 'Datasets']);
    expect(createVisinNavItems('label', {}).map(item => item.text)).toEqual(['Jobs', 'Bundles']);
    expect(createVisinNavItems(null, { label: 'https://label.test' }).map(item => item.text)).toEqual([
      'Jobs',
      'Bundles'
    ]);
  });

  it('ignores the current app own URL', () => {
    const items = createVisinNavItems('vision', { vision: 'https://vision.test' });

    expect(items.map(item => item.text)).toEqual(['Projects', 'Trainings', 'Datasets']);
    expect(items.every(item => item.path !== undefined)).toBe(true);
  });
});
