const leases = { findOneAndUpdate: jest.fn() };
jest.mock('mongoose', () => ({ __esModule: true, default: { connection: { collection: () => leases } } }));
jest.mock('../../logging/logger', () => ({ logger: { error: jest.fn() } }));

import { startSweeper } from '../../sweeper/sweeper';
import { logger } from '../../logging/logger';

/** The lease document as findOneAndUpdate hands it back: ours when the filter let us take it. */
const granted = () => leases.findOneAndUpdate.mockImplementation(async (_filter, update) => ({ holder: update.$set.holder }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('startSweeper', () => {
  it('runs once at start and then on its schedule, and stops cleanly', async () => {
    granted();
    const run = jest.fn().mockResolvedValue(undefined);
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 1000 });

    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(3);

    await sweeper.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(await sweeper.runOnce()).toBe(false);
  });

  it('takes a lease named after it, and skips while another process holds it', async () => {
    leases.findOneAndUpdate.mockResolvedValue({ holder: 'someone-else' });
    const run = jest.fn();
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
    const run = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 60_000 });
    await jest.advanceTimersByTimeAsync(0);

    const joined = sweeper.runOnce();
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    expect(await joined).toBe(true);
    await sweeper.stop();
  });

  it('logs a failed run, or a lease it could not ask for, and carries on', async () => {
    granted();
    const run = jest.fn().mockRejectedValue(new Error('file-service down'));
    const sweeper = startSweeper({ name: 'test-purge', run, everyMs: 60_000 });
    await jest.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenCalledWith('Sweeper run failed', { sweeper: 'test-purge', error: 'file-service down' });

    leases.findOneAndUpdate.mockRejectedValue(new Error('database unavailable'));
    expect(await sweeper.runOnce()).toBe(false);
    expect(logger.error).toHaveBeenLastCalledWith('Sweeper run failed', { sweeper: 'test-purge', error: 'database unavailable' });
    await sweeper.stop();
  });
});
