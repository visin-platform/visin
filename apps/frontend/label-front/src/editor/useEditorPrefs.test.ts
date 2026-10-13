import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEditorPrefs } from './useEditorPrefs';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useEditorPrefs', () => {
  it('starts from the defaults', () => {
    const { result } = renderHook(() => useEditorPrefs('j1'));

    expect(result.current[0]).toMatchObject({ tool: 'box', classKey: null, brushDiameter: 24, overlays: { lidar: false, radar: false } });
  });

  it('remembers what was chosen for the job, and keeps jobs apart', () => {
    const first = renderHook(() => useEditorPrefs('j1'));
    act(() => first.result.current[1]({ tool: 'brush', classKey: 'road' }));
    first.unmount();

    const again = renderHook(() => useEditorPrefs('j1'));
    expect(again.result.current[0]).toMatchObject({ tool: 'brush', classKey: 'road' });

    const other = renderHook(() => useEditorPrefs('j2'));
    expect(other.result.current[0].tool).toBe('box');
  });

  it('works when storage is unreadable, unwritable, or holds nonsense', () => {
    window.localStorage.setItem('visin-label-editor:j1', 'not json');
    expect(renderHook(() => useEditorPrefs('j1')).result.current[0].tool).toBe('box');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useEditorPrefs('j1'));
    act(() => result.current[1]({ tool: 'eraser' }));
    expect(result.current[0].tool).toBe('eraser');
  });
});
