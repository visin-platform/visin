class FakeUnrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecoverableError';
  }
}

const workerConstructor = jest.fn();

jest.mock('bullmq', () => ({
  Worker: workerConstructor,
  UnrecoverableError: FakeUnrecoverableError
}));
jest.mock('../../queue/connection', () => ({ createRedisConnection: jest.fn(() => 'REDIS') }));
jest.mock('../../services/ingestService', () => ({
  runImport: jest.fn(),
  markImportFailed: jest.fn(),
  NonRetryableIngestError: jest.requireActual('../../services/ingestService').NonRetryableIngestError
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { UnrecoverableError } from 'bullmq';
import { logger } from '@visin/backend-core';
import { createImportWorker } from '../../queue/importWorker';
import { IMPORT_QUEUE_NAME } from '../../queue/importQueue';
import { runImport, markImportFailed, NonRetryableIngestError } from '../../services/ingestService';

const mockedRunImport = runImport as jest.Mock;
const mockedMarkFailed = markImportFailed as jest.Mock;
const mockedLogger = logger as unknown as Record<string, jest.Mock>;

type Processor = (job: unknown) => Promise<void>;
type FailedHandler = (job: unknown, err: Error) => void;

interface Harness {
  processor: Processor;
  handlers: Record<string, (...args: never[]) => void>;
}

/** Build the worker and capture what it registered with BullMQ. */
const build = (): Harness => {
  const handlers: Record<string, (...args: never[]) => void> = {};
  let processor: Processor = async () => undefined;
  workerConstructor.mockImplementation((_name: string, fn: Processor) => {
    processor = fn;
    return { on: (event: string, handler: (...args: never[]) => void) => { handlers[event] = handler; } };
  });
  createImportWorker();
  return { processor, handlers };
};

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  data: { importJobId: 'i1', bundleId: 'b1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedRunImport.mockResolvedValue(undefined);
  mockedMarkFailed.mockResolvedValue(undefined);
});

describe('createImportWorker', () => {
  it('subscribes to the import queue, one job at a time by default', () => {
    build();

    const [name, , options] = workerConstructor.mock.calls[0];
    expect(name).toBe(IMPORT_QUEUE_NAME);
    expect(options.connection).toBe('REDIS');
    // Ingest is CPU-bound and shares the API's event loop.
    expect(options.concurrency).toBe(1);
    expect(options.maxStalledCount).toBe(2);
  });
});

describe('processor', () => {
  it('runs the import for the queued job', async () => {
    const { processor } = build();

    await processor(makeJob());

    expect(mockedRunImport).toHaveBeenCalledWith('i1');
  });

  it('propagates a transient failure so BullMQ retries it', async () => {
    const { processor } = build();
    mockedRunImport.mockRejectedValue(new Error('ECONNRESET'));

    await expect(processor(makeJob())).rejects.toThrow('ECONNRESET');
    await expect(processor(makeJob())).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('converts a structurally bad zip into an unrecoverable failure', async () => {
    const { processor } = build();
    mockedRunImport.mockRejectedValue(new NonRetryableIngestError('Zip exceeds 100000 entries'));

    // Otherwise the attempt budget is spent re-downloading a zip that will
    // fail identically every time.
    await expect(processor(makeJob())).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processor(makeJob())).rejects.toThrow('Zip exceeds 100000 entries');
  });
});

describe('failed handler', () => {
  // The 'failed' event fires after moveToFailed has counted the attempt that
  // just failed, so `attemptsMade` here is attempts made — not attempts before.
  it('leaves the ImportJob alone while attempts remain', async () => {
    const { handlers } = build();

    (handlers.failed as FailedHandler)(makeJob({ attemptsMade: 2 }), new Error('ECONNRESET'));

    expect(mockedMarkFailed).not.toHaveBeenCalled();
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  it('closes the ImportJob out on the last attempt', async () => {
    const { handlers } = build();

    (handlers.failed as FailedHandler)(makeJob({ attemptsMade: 3 }), new Error('ECONNRESET'));

    // Without this the dead import polls as `running` until it goes stale.
    expect(mockedMarkFailed).toHaveBeenCalledWith('i1', 'ECONNRESET');
  });

  it('closes the ImportJob out immediately on an unrecoverable failure', async () => {
    const { handlers } = build();

    // Unrecoverable short-circuits the budget: attempt 1 of 3 is still terminal.
    (handlers.failed as FailedHandler)(makeJob({ attemptsMade: 1 }), new FakeUnrecoverableError('bad zip'));

    expect(mockedMarkFailed).toHaveBeenCalledWith('i1', 'bad zip');
  });

  it('treats a missing attempts option as a single attempt', async () => {
    const { handlers } = build();

    (handlers.failed as FailedHandler)(makeJob({ attemptsMade: 1, opts: {} }), new Error('boom'));

    expect(mockedMarkFailed).toHaveBeenCalledWith('i1', 'boom');
  });

  it('logs when the failure has no job attached', async () => {
    const { handlers } = build();

    (handlers.failed as FailedHandler)(undefined, new Error('orphan'));

    expect(mockedMarkFailed).not.toHaveBeenCalled();
    expect(mockedLogger.error).toHaveBeenCalledWith('Bundle import failed without a job', { error: 'orphan' });
  });

  it('logs, rather than throws, when the import cannot be marked failed', async () => {
    const { handlers } = build();
    mockedMarkFailed.mockRejectedValue(new Error('mongo down'));

    (handlers.failed as FailedHandler)(makeJob({ attemptsMade: 3 }), new Error('ECONNRESET'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockedLogger.error).toHaveBeenCalledWith('Could not mark import failed', {
      importJobId: 'i1',
      error: 'mongo down'
    });
  });
});

describe('error handler', () => {
  it('logs worker-level errors instead of crashing the process', () => {
    const { handlers } = build();

    (handlers.error as (err: Error) => void)(new Error('redis gone'));

    expect(mockedLogger.error).toHaveBeenCalledWith('Import worker error', { error: 'redis gone' });
  });
});
