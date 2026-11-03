import { vi } from 'vitest';
const { leases } = vi.hoisted(() => {
  const leases = { findOneAndUpdate: vi.fn() };
  return { leases };
});

vi.mock('mongoose', async () => {
  const module = await (() => ({ __esModule: true, default: { connection: { collection: () => leases } } }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../logging/logger', async () => {
  const module = await (() => ({ logger: { error: vi.fn() } }))();
  return Object.assign({ default: module }, module);
});

import { startSweeper } from '../../sweeper/sweeper';
import { logger } from '../../logging/logger';

/** The lease document as findOneAndUpdate hands it back: ours when the filter let us take it. */
const granted = () =>
  leases.findOneAndUpdate.mockImplementation(async function (_filter, update) {
    return { holder: update.$set.holder };
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startSweeper', () => {
  it('runs once at start and then on its schedule, and stops cleanly', async () => {
    granted();
    const run = vi.fn().mockResolvedValue(undefined);
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 1000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(3);

    await sweeper.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(await sweeper.runOnce()).toBe(false);
  });

  it('takes a lease named after it, and skips while another process holds it', async () => {
    leases.findOneAndUpdate.mockResolvedValue({ holder: 'someone-else' });
    const run = vi.fn();
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 1000, leaseMs: 500 });

    expect(await sweeper.runOnce()).toBe(false);
    expect(run).not.toHaveBeenCalled();
    const [filter, update, options] = leases.findOneAndUpdate.mock.calls[0];
    expect(filter._id).toBe('test-purge');
    expect(update.$set.until.getTime() - Date.now()).toBe(500);
    expect(options).toMatchObject({ upsert: true });

    // The upsert collides with the other process's document: also "not ours".
    leases.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: 11000 }));
    expect(await sweeper.runOnce()).toBe(false);
    await sweeper.stop();
  });

  it('joins a run already going rather than starting a second', async () => {
    granted();
    let finish: () => void = () => undefined;
    const run = vi.fn(function () {
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);

    const joined = sweeper.runOnce();
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    expect(await joined).toBe(true);
    await sweeper.stop();
  });

  it('logs a failed run, or a lease it could not ask for, and carries on', async () => {
    granted();
    const run = vi.fn().mockRejectedValue(new Error('file-service down'));
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenCalledWith('Sweeper run failed', {
      sweeper: 'test-purge',
      error: 'file-service down'
    });

    leases.findOneAndUpdate.mockRejectedValue(new Error('database unavailable'));
    expect(await sweeper.runOnce()).toBe(false);
    expect(logger.error).toHaveBeenLastCalledWith('Sweeper run failed', {
      sweeper: 'test-purge',
      error: 'database unavailable'
    });
    await sweeper.stop();
  });
});
