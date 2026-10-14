import { describe, expect, it } from 'vitest';
import { PROJECT_TAB_KEYS, resolveProjectTab } from './projectTabs';

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
