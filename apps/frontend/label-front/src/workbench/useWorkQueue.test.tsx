import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  nextTask: vi.fn(),
  getTask: vi.fn(),
  getTaskAt: vi.fn(),
  submitAnswer: vi.fn(),
  undoAnswer: vi.fn(),
}));
vi.mock('./idmapLoader', () => ({
  preloadImages: vi.fn(),
}));

import { getTask, getTaskAt, nextTask, submitAnswer, undoAnswer } from '../services/jobService';
import { preloadImages } from './idmapLoader';
import { useWorkQueue, WorkQueueOptions } from './useWorkQueue';
import { AnswerSnapshot, WorkItem } from '../types';

const mockedNext = nextTask as ReturnType<typeof vi.fn>;
const mockedGetTask = getTask as ReturnType<typeof vi.fn>;
const mockedGetTaskAt = getTaskAt as ReturnType<typeof vi.fn>;
const mockedSubmit = submitAnswer as ReturnType<typeof vi.fn>;
const mockedUndo = undoAnswer as ReturnType<typeof vi.fn>;

const item = (
  id: string,
  overrides: { index?: number; total?: number; mine?: AnswerSnapshot | null; count?: number } = {}
): WorkItem => ({
  task: { _id: id, jobId: 'j1', labelImageId: 'img', order: overrides.index ?? 0 },
  images: { frame: { url: `frame-${id}` }, layers: [{ set: 's', url: `layer-${id}` }], idmap: { url: `idmap-${id}` } },
  position: { index: overrides.index ?? 0, total: overrides.total ?? 10 },
  answer: {
    count: overrides.count ?? (overrides.mine ? 1 : 0),
    mine: overrides.mine ?? null,
    latest: overrides.mine ?? null,
  },
});

/** A signed-in labeler on an active job — the mode the queue defaults to. */
const labeling = (extra: Partial<WorkQueueOptions> = {}): WorkQueueOptions => ({
  canPull: true,
  enabled: true,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWorkQueue with a shared task link', () => {
  it('opens the named task first, then resumes the normal queue', async () => {
    mockedGetTask.mockResolvedValue(item('t9'));
    mockedNext.mockResolvedValue(item('t2'));

    const { result } = renderHook(() => useWorkQueue('j1', labeling({ startTaskId: 't9' })));

    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(mockedGetTask).toHaveBeenCalledWith('t9');
    expect(result.current.current?.task._id).toBe('t9');
    // Fetched, not pulled — the queue would never hand back a task this user
    // already answered, which is exactly the link someone shares to ask about.
    expect(mockedNext).toHaveBeenCalledTimes(1);
    expect(mockedNext).toHaveBeenCalledWith('j1', ['t9']);
    expect(preloadImages).toHaveBeenCalledWith(expect.arrayContaining(['frame-t9']));
  });

  it('surfaces a link to a task that no longer exists', async () => {
    mockedGetTask.mockRejectedValue(new Error('Task not found'));

    const { result } = renderHook(() => useWorkQueue('j1', labeling({ startTaskId: 'gone' })));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Task not found');
  });
});

describe('useWorkQueue', () => {
  it('loads the first task and prefetches the second', async () => {
    mockedNext.mockResolvedValueOnce(item('t1')).mockResolvedValueOnce(item('t2'));

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));

    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(result.current.current?.task._id).toBe('t1');
    expect(mockedNext).toHaveBeenCalledTimes(2);
    // The prefetch excludes the task we already hold — the backend re-serves
    // the caller's own leases otherwise.
    expect(mockedNext).toHaveBeenNthCalledWith(1, 'j1', []);
    expect(mockedNext).toHaveBeenNthCalledWith(2, 'j1', ['t1']);
    expect(preloadImages).toHaveBeenCalledWith(['frame-t1', 'layer-t1', 'idmap-t1']);
  });

  it('is done immediately when the queue is empty', async () => {
    mockedNext.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));

    await waitFor(() => expect(result.current.status).toBe('done'));
  });

  it('reports errors', async () => {
    mockedNext.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('boom');
  });

  it('advances to the prefetched task on answer and counts the session', async () => {
    mockedNext
      .mockResolvedValueOnce(item('t1'))
      .mockResolvedValueOnce(item('t2'))
      .mockResolvedValueOnce(null);
    mockedSubmit.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.answer({ choiceKey: 'good' }));

    expect(mockedSubmit).toHaveBeenCalledWith('t1', { choiceKey: 'good' });
    expect(result.current.current?.task._id).toBe('t2');
    expect(result.current.sessionAnswered).toBe(1);
    expect(result.current.canUndo).toBe(true);
  });

  it('finishes when the last task is answered', async () => {
    mockedNext.mockResolvedValueOnce(item('t1')).mockResolvedValue(null);
    mockedSubmit.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.answer({ choiceKey: 'good' }));

    expect(result.current.status).toBe('done');
    expect(result.current.current).toBeNull();
  });

  it('undoLast restores the answered task as current', async () => {
    mockedNext
      .mockResolvedValueOnce(item('t1'))
      .mockResolvedValueOnce(item('t2'))
      .mockResolvedValueOnce(null);
    mockedSubmit.mockResolvedValue(undefined);
    mockedUndo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));
    await waitFor(() => expect(result.current.status).toBe('working'));
    await act(() => result.current.answer({ choiceKey: 'good' }));

    await act(() => result.current.undoLast());

    expect(mockedUndo).toHaveBeenCalledWith('t1');
    expect(result.current.current?.task._id).toBe('t1');
    expect(result.current.sessionAnswered).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });
});

describe('useWorkQueue browsing', () => {
  const mine = (rejectedMaskIds: number[]): AnswerSnapshot => ({
    rejectedMaskIds,
    updatedAt: '2026-08-01T00:00:00.000Z',
  });

  it('opens at the first frame without pulling when the queue is unavailable', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(mockedGetTaskAt).toHaveBeenCalledWith('j1', 0);
    // Pulling takes a lease, which a signed-out visitor cannot hold.
    expect(mockedNext).not.toHaveBeenCalled();
    expect(result.current.browsing).toBe(true);
  });

  it('does nothing until enabled — the job status decides the mode', async () => {
    const { result } = renderHook(() => useWorkQueue('j1', { canPull: true, enabled: false }));

    expect(result.current.status).toBe('loading');
    expect(mockedNext).not.toHaveBeenCalled();
    expect(mockedGetTaskAt).not.toHaveBeenCalled();
  });

  it('steps to a frame by position and enters browse mode', async () => {
    mockedNext.mockResolvedValueOnce(item('t1')).mockResolvedValueOnce(item('t2'));
    mockedGetTaskAt.mockResolvedValue(item('t7', { index: 6 }));

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.goTo(6));

    expect(mockedGetTaskAt).toHaveBeenCalledWith('j1', 6);
    expect(result.current.current?.task._id).toBe('t7');
    expect(result.current.browsing).toBe(true);
    // The queue's undo target was left behind with the queue.
    expect(result.current.canUndo).toBe(false);
  });

  it('stays past the end rather than blanking the frame', async () => {
    mockedGetTaskAt.mockResolvedValueOnce(item('t1')).mockResolvedValueOnce(null);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.goTo(99));

    expect(result.current.current?.task._id).toBe('t1');
    expect(result.current.status).toBe('working');
  });

  it('saves in place while browsing instead of advancing', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1', { index: 0 }));
    mockedSubmit.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.answer({ rejectedMaskIds: [3] }));

    expect(result.current.current?.task._id).toBe('t1');
    expect(result.current.current?.answer.mine?.rejectedMaskIds).toEqual([3]);
    expect(result.current.sessionAnswered).toBe(1);
    // Re-reading the task would hand back freshly signed image URLs, which the
    // workbench reads as a new frame.
    expect(mockedGetTask).not.toHaveBeenCalled();
    expect(result.current.current?.images.frame.url).toBe('frame-t1');
  });

  it('counts a revision as a correction, not another frame labeled', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1', { mine: mine([3]) }));
    mockedSubmit.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.answer({ rejectedMaskIds: [3, 8] }));

    expect(mockedSubmit).toHaveBeenCalledWith('t1', { rejectedMaskIds: [3, 8] });
    expect(result.current.current?.answer.mine?.rejectedMaskIds).toEqual([3, 8]);
    expect(result.current.current?.answer.count).toBe(1);
    expect(result.current.sessionAnswered).toBe(0);
  });

  it('undo while browsing withdraws the answer on this frame and stays put', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1', { mine: mine([3]) }));
    mockedUndo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(result.current.canUndo).toBe(true);

    await act(() => result.current.undoLast());

    expect(mockedUndo).toHaveBeenCalledWith('t1');
    expect(result.current.current?.task._id).toBe('t1');
    expect(result.current.current?.answer.mine).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it('resumeQueue leaves browse mode and pulls the next unlabeled frame', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t7', { index: 6 }));
    mockedNext.mockResolvedValueOnce(item('t2')).mockResolvedValueOnce(item('t3'));

    const { result } = renderHook(() => useWorkQueue('j1', labeling({ startBrowsing: true })));
    await waitFor(() => expect(result.current.status).toBe('working'));
    expect(result.current.browsing).toBe(true);
    expect(mockedNext).not.toHaveBeenCalled();

    await act(() => result.current.resumeQueue());

    expect(result.current.browsing).toBe(false);
    expect(result.current.current?.task._id).toBe('t2');
    expect(mockedNext).toHaveBeenNthCalledWith(2, 'j1', ['t2']);
  });
});

describe('useWorkQueue edge cases', () => {
  it('ignores a step before the first frame', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));
    mockedGetTaskAt.mockClear();

    await act(() => result.current.goTo(-1));

    expect(mockedGetTaskAt).not.toHaveBeenCalled();
  });

  it('surfaces a failure while stepping', async () => {
    mockedGetTaskAt.mockResolvedValueOnce(item('t1')).mockRejectedValueOnce(new Error('gateway'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.goTo(1));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('gateway');
    expect(result.current.navigating).toBe(false);
  });

  it('surfaces a failure while resuming the queue', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1'));
    mockedNext.mockRejectedValue(new Error('lease failed'));

    const { result } = renderHook(() => useWorkQueue('j1', labeling({ startBrowsing: true })));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.resumeQueue());

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('lease failed');
  });

  it('is done when resuming finds nothing left to label', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1'));
    mockedNext.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkQueue('j1', labeling({ startBrowsing: true })));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.resumeQueue());

    expect(result.current.status).toBe('done');
    expect(result.current.current).toBeNull();
  });

  it('does nothing when asked to answer or undo with no frame open', async () => {
    mockedNext.mockResolvedValue(null);

    const { result } = renderHook(() => useWorkQueue('j1', labeling()));
    await waitFor(() => expect(result.current.status).toBe('done'));

    await act(() => result.current.answer({ choiceKey: 'good' }));
    await act(() => result.current.undoLast());

    expect(mockedSubmit).not.toHaveBeenCalled();
    expect(mockedUndo).not.toHaveBeenCalled();
  });

  it('does not undo a frame you never answered while browsing', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1'));

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    expect(result.current.canUndo).toBe(false);
    await act(() => result.current.undoLast());

    expect(mockedUndo).not.toHaveBeenCalled();
  });

  // Withdrawing your answer does not withdraw anyone else's, so the frame stays
  // labeled — just not by you.
  it('leaves another labeler answer in place when you withdraw yours', async () => {
    mockedGetTaskAt.mockResolvedValue(
      item('t1', { mine: { rejectedMaskIds: [1], updatedAt: '2026-08-01T00:00:00.000Z' }, count: 2 })
    );
    mockedUndo.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.undoLast());

    expect(result.current.current?.answer.count).toBe(1);
    expect(result.current.current?.answer.mine).toBeNull();
    expect(result.current.current?.answer.latest).not.toBeNull();
  });

  it('records a first answer on a browsed frame as a new label', async () => {
    mockedGetTaskAt.mockResolvedValue(item('t1'));
    mockedSubmit.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1', { canPull: false, enabled: true }));
    await waitFor(() => expect(result.current.status).toBe('working'));

    await act(() => result.current.answer({ choiceKey: 'good' }));

    expect(result.current.current?.answer.count).toBe(1);
    expect(result.current.current?.answer.mine).toMatchObject({ choiceKey: 'good' });
  });
});
