import { describe, it, expect } from 'vitest';
import { APPS, SHELL_APPS, appForPath } from './apps';

describe('appForPath', () => {
  it.each([
    ['/projects', 'vision'],
    ['/projects/p1', 'vision'],
    ['/comparisons/uuid-1', 'vision'],
    ['/trainings/compare', 'vision'],
    ['/datasets/d1', 'vision'],
    ['/visualizations/compare-trainings', 'vision'],
    ['/benchmarks', 'vision'],
    ['/jobs', 'label'],
    ['/jobs/new', 'label'],
    ['/jobs/j1/work', 'label'],
    ['/bundles', 'label'],
    ['/account', 'account'],
    ['/account/api-keys', 'account'],
    ['/invite', 'account'],
  ])('sends %s to %s', (path, app) => {
    expect(appForPath(path)).toBe(app);
  });

  it('matches whole path segments, not string prefixes', () => {
    expect(appForPath('/jobsearch')).toBeNull();
    expect(appForPath('/accounting')).toBeNull();
  });

  it('owns nothing for a path no app serves', () => {
    expect(appForPath('/')).toBeNull();
    expect(appForPath('/nowhere')).toBeNull();
  });

  // Paths are shared by all three apps on one page, with no basename between
  // them — an overlap would silently hand one app's URLs to another.
  it('never gives two apps the same prefix', () => {
    const prefixes = SHELL_APPS.flatMap((app) => APPS[app].prefixes);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('app layouts', () => {
  it('lets Vision pages draw their own titles, at Vision width', () => {
    expect(APPS.vision.layout('/projects')).toEqual({ maxContentWidth: 1600, showPageHeader: false });
  });

  it('frames Labeling pages at reading width, but gives the workbench the whole display', () => {
    expect(APPS.label.layout('/jobs/j1')).toEqual({ maxContentWidth: 1400, showPageHeader: true });
    expect(APPS.label.layout('/jobs/j1/work')).toEqual({ maxContentWidth: 100000, showPageHeader: false });
  });

  it('frames Account at its narrow width with the shell header', () => {
    expect(APPS.account.layout('/account/profile')).toEqual({ maxContentWidth: 800, showPageHeader: true });
  });
});
