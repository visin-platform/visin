import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTabPresence } from './useTabPresence';

afterEach(() => vi.unstubAllGlobals());

describe('useTabPresence', () => {
  it('tells both tabs when they hold the same frame', async () => {
    const first = renderHook(({ taskId }) => useTabPresence(taskId), { initialProps: { taskId: 't1' as string | null } });
    const second = renderHook(() => useTabPresence('t1'));

    await waitFor(() => expect(second.result.current).toBe(true));
    await waitFor(() => expect(first.result.current).toBe(true));

    // Moving on to another frame clears it.
    first.rerender({ taskId: 't2' });
    expect(first.result.current).toBe(false);
    first.unmount();
    second.unmount();
  });

  it('stays quiet for different frames, and with no frame', async () => {
    const first = renderHook(() => useTabPresence('t1'));
    const second = renderHook(() => useTabPresence('t2'));
    const none = renderHook(() => useTabPresence(null));

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(first.result.current).toBe(false);
    expect(second.result.current).toBe(false);
    expect(none.result.current).toBe(false);
    first.unmount();
    second.unmount();
  });

  it('does nothing where tabs cannot talk to each other', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(renderHook(() => useTabPresence('t1')).result.current).toBe(false);

    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('SecurityError');
        }
      }
    );
    expect(renderHook(() => useTabPresence('t1')).result.current).toBe(false);
  });
});
