import { describe, expect, it } from 'vitest';
import { PROJECT_TAB_KEYS, hiddenProjectTabs, isInferenceProject, resolveProjectTab } from './projectTabs';

describe('resolveProjectTab', () => {
  it('names each tab by its name, so a tab can be linked to', () => {
    for (const key of PROJECT_TAB_KEYS.filter((candidate) => candidate !== 'settings')) {
      expect(resolveProjectTab(key, false)).toBe(key);
    }
    expect(resolveProjectTab('settings', true)).toBe('settings');
  });

  it('opens the overview for a name it does not know, or none', () => {
    expect(resolveProjectTab('nonsense', true)).toBe('overview');
    expect(resolveProjectTab(null, true)).toBe('overview');
  });

  it('keeps Settings for those who can manage the project', () => {
    expect(resolveProjectTab('settings', false)).toBe('overview');
  });
});

describe('hiddenProjectTabs', () => {
  it('hides nothing for a project with any training run, or before its totals arrive', () => {
    expect(hiddenProjectTabs({ totalTrainings: 3, inferenceTrainings: 2 }, {})).toEqual(new Set());
    expect(hiddenProjectTabs(undefined, undefined)).toEqual(new Set());
    expect(hiddenProjectTabs({ totalTrainings: 0, inferenceTrainings: 0 }, {})).toEqual(new Set());
    expect(isInferenceProject({ totalTrainings: 2 })).toBe(false);
  });

  it('hides what only training runs fill when every run is an inference run, unless something is there', () => {
    const inference = { totalTrainings: 3, inferenceTrainings: 3 };
    expect(isInferenceProject(inference)).toBe(true);
    expect(hiddenProjectTabs(inference, { visualizationsCount: 0, benchmarksCount: 0 })).toEqual(
      new Set(['comparisons', 'models', 'visualizations', 'benchmarks'])
    );
    expect(hiddenProjectTabs(inference, { visualizationsCount: 4, benchmarksCount: 1 })).toEqual(new Set(['comparisons', 'models']));
  });
});
