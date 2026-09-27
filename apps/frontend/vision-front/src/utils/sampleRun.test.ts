import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../config/visionApi', () => ({ visionApi: api }));

import { SAMPLE_EPOCHS, SAMPLE_TAG, sampleEpoch, sendSampleRun, startSampleRun } from './sampleRun';

const conflict = () => Object.assign(new Error('already exists'), { status: 409 });

describe('sampleEpoch', () => {
  it("uses the docs quickstart's formula, noise included", () => {
    const quiet = sampleEpoch(6, () => 0);
    expect(quiet.train.loss).toBeCloseTo(1.2 * Math.exp(-1) + 0.1);
    expect(quiet.val.loss).toBeCloseTo(quiet.train.loss + 0.05 + 0.012);
    expect(quiet.val.mean_iou).toBeCloseTo(0.3 + 0.35 * (1 - Math.exp(-6 / 5)));
    expect(sampleEpoch(6, () => 1).train.loss - quiet.train.loss).toBeCloseTo(0.02);
    // Aggregate metrics only: no class or condition names.
    expect(Object.keys(quiet.val).sort()).toEqual(['loss', 'mean_iou']);
  });
});

describe('sendSampleRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockImplementation(async (path: string) => (path === '/trainings' ? { data: { data: { _id: 't1' } } } : { data: {} }));
    api.put.mockResolvedValue({ data: {} });
  });

  it('creates a tagged run in the project, sends every epoch under a fixed id, and completes it', async () => {
    const onProgress = vi.fn();
    const start = startSampleRun();

    const done = await sendSampleRun('p1', start, onProgress);

    expect(api.post).toHaveBeenNthCalledWith(1, '/trainings', {
      uuid: start.runUuid, name: 'Sample run', status: 'running', tags: [SAMPLE_TAG], projectId: 'p1'
    });
    const epochs = api.post.mock.calls.filter(([path]) => path === '/epochs/upload');
    expect(epochs).toHaveLength(SAMPLE_EPOCHS);
    expect(epochs[0][1]).toMatchObject({ training_uuid: start.runUuid, epoch_uuid: `${start.runUuid}-epoch-1`, epoch: 1 });
    expect(api.put).toHaveBeenCalledWith('/trainings/t1', { status: 'completed' });
    expect(done).toEqual({ runUuid: start.runUuid, trainingId: 't1', sent: SAMPLE_EPOCHS });
    expect(onProgress).toHaveBeenLastCalledWith(done);
  });

  it('carries on from the epoch that failed, counting one that was stored after all', async () => {
    const start = { runUuid: 'r1', trainingId: 't1', sent: 7 };
    api.post.mockRejectedValueOnce(conflict());

    const done = await sendSampleRun('p1', start, vi.fn());

    const epochs = api.post.mock.calls.filter(([path]) => path === '/epochs/upload').map(([, body]) => body.epoch);
    expect(epochs[0]).toBe(8);
    expect(epochs).toHaveLength(SAMPLE_EPOCHS - 7);
    expect(api.post).not.toHaveBeenCalledWith('/trainings', expect.anything());
    expect(done.sent).toBe(SAMPLE_EPOCHS);
  });

  it('finds a run the failed attempt created after all', async () => {
    api.post.mockRejectedValueOnce(conflict());
    api.get.mockResolvedValue({ data: { data: { _id: 't2' } } });

    const done = await sendSampleRun('p1', { runUuid: 'r2', sent: 0 }, vi.fn());

    expect(api.get).toHaveBeenCalledWith('/trainings/uuid/r2');
    expect(done.trainingId).toBe('t2');
  });

  it('stops on any other failure, with the progress so far reported', async () => {
    const onProgress = vi.fn();
    api.post.mockImplementation(async (path: string, body: { epoch?: number }) => {
      if (path === '/trainings') return { data: { data: { _id: 't1' } } };
      if (body.epoch === 3) throw Object.assign(new Error('Service Unavailable'), { status: 503 });
      return { data: {} };
    });

    await expect(sendSampleRun('p1', { runUuid: 'r3', sent: 0 }, onProgress)).rejects.toThrow('Service Unavailable');
    expect(onProgress).toHaveBeenLastCalledWith({ runUuid: 'r3', trainingId: 't1', sent: 2 });
    expect(api.put).not.toHaveBeenCalled();
  });
});
