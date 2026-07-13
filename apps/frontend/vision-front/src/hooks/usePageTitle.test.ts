import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from './usePageTitle';

describe('usePageTitle', () => {
  it('sets document.title to the given title', () => {
    renderHook(() => usePageTitle('My Page'));
    expect(document.title).toBe('My Page');
  });

  it('updates document.title when the title prop changes', () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), { initialProps: { title: 'First' } });
    expect(document.title).toBe('First');

    rerender({ title: 'Second' });
    expect(document.title).toBe('Second');
  });
});
