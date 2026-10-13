import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  nextTask: vi.fn(),
  getTask: vi.fn(),
  getTaskAt: vi.fn(),
  finishTask: vi.fn()
}));
vi.mock('./imageLoader', () => ({ preloadImages: vi.fn() }));

import { finishTask, getTask, getTaskAt, nextTask } from '../services/jobService';
import { preloadImages } from './imageLoader';
import { useWorkQueue } from './useWorkQueue';
import { makeItem } from '../test/fixtures';
import type { WorkItem } from '../types';

const next = nextTask as ReturnType<typeof vi.fn>;
const at = getTaskAt as ReturnType<typeof vi.fn>;
const named = getTask as ReturnType<typeof vi.fn>;
const finish = finishTask as ReturnType<typeof vi.fn>;

const item = (id: string, extra: Partial<WorkItem> = {}) => makeItem(id, extra);

beforeEach(() => {
  vi.clearAllMocks();
  finish.mockResolvedValue(undefined);
});

describe('queue mode', () => {
  it('opens on the first leased frame and holds the next one ahead', async () => {
    next.mockResolvedValueOnce(item('a')).mockResolvedValueOnce(item('b'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(result.current.current?.task._id).toBe('a');
    expect(result.current.browsing).toBe(false);
    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));
    expect(next).toHaveBeenLastCalledWith('j1', ['a']);
    expect(preloadImages).toHaveBeenCalled();
  });

  it('finishing a frame closes it and shows the prefetched one at once', async () => {
    next
      .mockResolvedValueOnce(item('a'))
      .mockResolvedValueOnce(item('b'))
      .mockResolvedValueOnce(item('c'));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.finish('done', 1200);
    });

    expect(finish).toHaveBeenCalledWith('a', 'done', 1200);
    expect(result.current.current?.task._id).toBe('b');
    expect(result.current.sessionDone).toBe(1);
    expect(next).toHaveBeenLastCalledWith('j1', ['b', 'a']);
  });

  it('counts a frame once, and not at all when it was already finished or skipped', async () => {
    next.mockResolvedValue(item('a', { annotation: { count: 1, mine: { status: 'done', objects: [], updatedAt: '2026-10-01' }, latest: null } }));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.finish('done');
    });
    expect(result.current.sessionDone).toBe(0);

    next.mockReset();
    next.mockResolvedValue(item('z'));
    await act(async () => {
      await result.current.finish('skip');
    });
    expect(finish).toHaveBeenLastCalledWith(expect.any(String), 'skip', undefined);
    expect(result.current.sessionDone).toBe(0);
  });

  it('ends when there is nothing left', async () => {
    next.mockResolvedValueOnce(item('a')).mockResolvedValueOnce(null).mockResolvedValue(null);
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.finish('done');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.current).toBeNull();
  });

  it('reports nothing to do straight away', async () => {
    next.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('done'));
  });

  it('reports a failure to load', async () => {
    next.mockRejectedValue(new Error('lease failed'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('lease failed');
  });

  it('keeps the frame up and rethrows when closing it fails', async () => {
    next.mockResolvedValue(item('a'));
    finish.mockRejectedValueOnce(new Error('job paused'));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await expect(
      act(async () => {
        await result.current.finish('done');
      })
    ).rejects.toThrow('job paused');

    expect(result.current.current?.task._id).toBe('a');
    expect(result.current.navigating).toBe(false);
  });

  it('does nothing until it is enabled', async () => {
    renderHook(() => useWorkQueue('j1', { canPull: true, enabled: false }));
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('browse mode', () => {
  it('opens on the first frame without taking a lease when the caller cannot pull', async () => {
    at.mockResolvedValue(item('first'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(at).toHaveBeenCalledWith('j1', 0);
    expect(next).not.toHaveBeenCalled();
    expect(result.current.browsing).toBe(true);
  });

  it('can be asked for by a caller who could pull', async () => {
    at.mockResolvedValue(item('first'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, startBrowsing: true, enabled: true }));

    await waitFor(() => expect(result.current.browsing).toBe(true));
    expect(next).not.toHaveBeenCalled();
  });

  it('steps to a position, and stays put when it is past the end', async () => {
    at.mockResolvedValueOnce(item('first')).mockResolvedValueOnce(item('third')).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.goTo(2);
    });
    expect(result.current.current?.task._id).toBe('third');

    await act(async () => {
      await result.current.goTo(99);
      await result.current.goTo(-1);
    });
    expect(result.current.current?.task._id).toBe('third');
  });

  it('reports a failed step', async () => {
    at.mockResolvedValueOnce(item('first')).mockRejectedValueOnce(new Error('gone'));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.goTo(1);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('gone');
  });

  it('opens a named frame first, fetched rather than leased', async () => {
    named.mockResolvedValue(item('shared'));
    next.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, startTaskId: 'shared', enabled: true }));

    await waitFor(() => expect(result.current.current?.task._id).toBe('shared'));
    expect(named).toHaveBeenCalledWith('shared');
    expect(result.current.browsing).toBe(false);
  });

  it('going back, fixing and finishing returns to the queue', async () => {
    next.mockResolvedValueOnce(item('a')).mockResolvedValueOnce(item('b')).mockResolvedValue(item('c'));
    at.mockResolvedValue(item('earlier'));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.goTo(0);
    });
    expect(result.current.browsing).toBe(true);
    expect(result.current.current?.task._id).toBe('earlier');

    await act(async () => {
      await result.current.finish('done');
    });

    expect(result.current.browsing).toBe(false);
    expect(result.current.current?.task._id).toBe('b');
  });

  it('resumes the queue with the frame it was holding', async () => {
    next.mockResolvedValueOnce(item('a')).mockResolvedValueOnce(item('b')).mockResolvedValue(item('c'));
    at.mockResolvedValue(item('earlier'));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: true }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.goTo(0);
    });

    await act(async () => {
      await result.current.resumeQueue();
    });

    expect(result.current.browsing).toBe(false);
    expect(result.current.current?.task._id).toBe('b');
  });

  it('resumes by pulling when it holds nothing, and says when the queue is empty', async () => {
    at.mockResolvedValue(item('first'));
    next.mockResolvedValueOnce(item('a')).mockResolvedValueOnce(null).mockResolvedValue(null);
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, startBrowsing: true, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.resumeQueue();
    });
    expect(result.current.current?.task._id).toBe('a');

    await act(async () => {
      await result.current.goTo(0);
    });
    await act(async () => {
      await result.current.resumeQueue();
      await result.current.resumeQueue();
    });
    expect(result.current.status).toBe('done');
  });

  it('steps on through a job that hands out no work after a frame is corrected', async () => {
    at.mockResolvedValueOnce(item('first', { position: { index: 0, total: 2 } })).mockResolvedValueOnce(item('second', { position: { index: 1, total: 2 } }));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.finish('done');
    });

    expect(next).not.toHaveBeenCalled();
    expect(at).toHaveBeenLastCalledWith('j1', 1);
    expect(result.current.current?.task._id).toBe('second');

    // On the last frame there is nowhere to go: it stays, marked as finished.
    await act(async () => {
      await result.current.finish('done');
    });
    expect(result.current.current?.task._id).toBe('second');
    expect(result.current.current?.annotation.mine?.status).toBe('done');

    await act(async () => {
      await result.current.finish('skip');
    });
    expect(result.current.current?.annotation.mine?.status).toBe('skipped');
  });

  it('stays on the frame when the next one cannot be found', async () => {
    at.mockResolvedValueOnce(item('first', { position: { index: 0, total: 3 } })).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.finish('done');
    });

    expect(result.current.current?.task._id).toBe('first');
  });

  it('reports a failed resume', async () => {
    at.mockResolvedValue(item('first'));
    next.mockRejectedValue(new Error('no lease'));
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, startBrowsing: true, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(async () => {
      await result.current.resumeQueue();
    });

    expect(result.current.status).toBe('error');
  });
});
