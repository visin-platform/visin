import { describe, it, expect } from 'vitest';
import { createVisinNavItems } from './navigation';

describe('createVisinNavItems', () => {
  it('lists only the current app sections, plus one link to the other app', () => {
    const fromVision = createVisinNavItems('vision', { label: 'https://label.test' });
    const fromLabel = createVisinNavItems('label', { vision: 'https://vision.test' });

    // Labeling's own sections stay in Labeling's sidebar, and vice versa.
    expect(fromVision.map(item => item.text)).toEqual(['Projects', 'Trainings', 'Datasets', 'Labeling']);
    expect(fromLabel.map(item => item.text)).toEqual(['Jobs', 'New job', 'Bundles', 'Vision']);
  });

  it('keeps the current app sections as internal routes', () => {
    const items = createVisinNavItems('vision', { label: 'https://label.test' });
    const projects = items.find(item => item.text === 'Projects');

    expect(projects).toMatchObject({ path: '/projects' });
    expect(projects?.href).toBeUndefined();
  });

  it('sends the cross-app entry to that app first section', () => {
    expect(createVisinNavItems('vision', { label: 'https://label.test' }).at(-1)).toMatchObject({
      text: 'Labeling',
      href: 'https://label.test/jobs'
    });
    expect(createVisinNavItems('label', { vision: 'https://vision.test' }).at(-1)).toMatchObject({
      text: 'Vision',
      href: 'https://vision.test/projects'
    });
  });

  it('separates the cross-app entry with a divider', () => {
    const items = createVisinNavItems('vision', { label: 'https://label.test' });

    expect(items.at(-1)?.dividerBefore).toBe(true);
    expect(items.filter(item => item.dividerBefore).length).toBe(1);
  });

  it('tolerates a trailing slash on the configured base URL', () => {
    const items = createVisinNavItems('vision', { label: 'https://label.test/' });

    expect(items.at(-1)).toMatchObject({ href: 'https://label.test/jobs' });
  });

  it('omits the cross-app entry when the other app has no URL configured', () => {
    // A dead link into the current origin would 404; an absent entry is honest.
    expect(createVisinNavItems('vision', {}).map(item => item.text)).toEqual([
      'Projects',
      'Trainings',
      'Datasets'
    ]);
    expect(createVisinNavItems('label', {}).map(item => item.text)).toEqual([
      'Jobs',
      'New job',
      'Bundles'
    ]);
  });

  it('ignores the current app own URL', () => {
    const items = createVisinNavItems('vision', { vision: 'https://vision.test' });

    expect(items.map(item => item.text)).toEqual(['Projects', 'Trainings', 'Datasets']);
  });
});
