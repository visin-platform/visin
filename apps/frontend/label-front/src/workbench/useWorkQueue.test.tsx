import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  nextTask: vi.fn(),
  submitAnswer: vi.fn(),
  undoAnswer: vi.fn(),
}));
vi.mock('./idmapLoader', () => ({
  preloadImages: vi.fn(),
}));

import { nextTask, submitAnswer, undoAnswer } from '../services/jobService';
import { preloadImages } from './idmapLoader';
import { useWorkQueue } from './useWorkQueue';
import { WorkItem } from '../types';

const mockedNext = nextTask as ReturnType<typeof vi.fn>;
const mockedSubmit = submitAnswer as ReturnType<typeof vi.fn>;
const mockedUndo = undoAnswer as ReturnType<typeof vi.fn>;

const item = (id: string): WorkItem => ({
  task: { _id: id, jobId: 'j1', labelImageId: 'img', order: 0 },
  images: { frame: { url: `frame-${id}` }, layers: [{ set: 's', url: `layer-${id}` }], idmap: { url: `idmap-${id}` } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWorkQueue', () => {
  it('loads the first task and prefetches the second', async () => {
    mockedNext.mockResolvedValueOnce(item('t1')).mockResolvedValueOnce(item('t2'));

    const { result } = renderHook(() => useWorkQueue('j1'));

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

    const { result } = renderHook(() => useWorkQueue('j1'));

    await waitFor(() => expect(result.current.status).toBe('done'));
  });

  it('reports errors', async () => {
    mockedNext.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useWorkQueue('j1'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('boom');
  });

  it('advances to the prefetched task on answer and counts the session', async () => {
    mockedNext
      .mockResolvedValueOnce(item('t1'))
      .mockResolvedValueOnce(item('t2'))
      .mockResolvedValueOnce(null);
    mockedSubmit.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWorkQueue('j1'));
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

    const { result } = renderHook(() => useWorkQueue('j1'));
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

    const { result } = renderHook(() => useWorkQueue('j1'));
    await waitFor(() => expect(result.current.status).toBe('working'));
    await act(() => result.current.answer({ choiceKey: 'good' }));

    await act(() => result.current.undoLast());

    expect(mockedUndo).toHaveBeenCalledWith('t1');
    expect(result.current.current?.task._id).toBe('t1');
    expect(result.current.sessionAnswered).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });
});
