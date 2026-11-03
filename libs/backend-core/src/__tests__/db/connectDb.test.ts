import { vi, type Mock } from 'vitest';
vi.mock('mongoose', async () => {
  const module = await (() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    connection: {
      on: vi.fn(),
      getClient: vi.fn(function () {
        return { client: true };
      })
    }
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../db/commandMonitoring', async () => {
  const module = await (() => ({ observeCommands: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../logging/logger', async () => {
  const module = await (() => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});

type LoggerMock = { info: Mock; warn: Mock; error: Mock };

// connectDb keeps a module-level "already connected" flag, so each test loads
// a fresh copy of the module (and the mongoose mock instance it captured).
async function loadFresh() {
  let connectDb!: typeof import('../../db/connectDb').connectDb;
  let mongooseMock!: { connect: Mock; connection: { on: Mock; getClient: Mock } };
  let loggerMock!: LoggerMock;
  let observeCommands!: Mock;
  vi.resetModules();
  await (async () => {
    mongooseMock = (await import('mongoose')).default as unknown as typeof mongooseMock;
    observeCommands = ((await import('../../db/commandMonitoring')) as { observeCommands: Mock }).observeCommands;
    loggerMock = ((await import('../../logging/logger')) as unknown as { logger: LoggerMock }).logger;
    connectDb = (
      (await vi.importActual<typeof import('../../db/connectDb')>(
        '../../db/connectDb'
      )) as typeof import('../../db/connectDb')
    ).connectDb;
  })();
  return { connectDb, mongooseMock, loggerMock, observeCommands };
}

const ORIGINAL_MONGODB_URI = process.env.MONGODB_URI;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked((await import('mongoose')).default.connect).mockResolvedValue(undefined as never);
  delete process.env.MONGODB_URI;
});

afterAll(() => {
  if (ORIGINAL_MONGODB_URI === undefined) {
    delete process.env.MONGODB_URI;
  } else {
    process.env.MONGODB_URI = ORIGINAL_MONGODB_URI;
  }
});

describe('connectDb', () => {
  it('throws when neither options.uri nor MONGODB_URI is set', async () => {
    const { connectDb, mongooseMock } = await loadFresh();

    await expect(connectDb({ serviceName: 'auth-service' })).rejects.toThrow('MONGODB_URI not set');
    expect(mongooseMock.connect).not.toHaveBeenCalled();
  });

  it('connects with an explicitly passed uri and logs the service name', async () => {
    const { connectDb, mongooseMock, loggerMock } = await loadFresh();

    await connectDb({ uri: 'mongodb://explicit-host/db', serviceName: 'vision-service' });

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://explicit-host/db', { monitorCommands: true });
    expect(loggerMock.info).toHaveBeenCalledWith('[vision-service] MongoDB connected');
  });

  it('hands the driver client to the query timing, once connected', async () => {
    const { connectDb, mongooseMock, observeCommands } = await loadFresh();

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'vision-service' });

    expect(observeCommands).toHaveBeenCalledWith(mongooseMock.connection.getClient.mock.results[0].value);
  });

  it('falls back to process.env.MONGODB_URI when no uri option is given', async () => {
    const { connectDb, mongooseMock } = await loadFresh();
    process.env.MONGODB_URI = 'mongodb://env-host/db';

    await connectDb({ serviceName: 'file-service' });

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://env-host/db', { monitorCommands: true });
  });

  it('is a no-op on a second call once connected', async () => {
    const { connectDb, mongooseMock } = await loadFresh();

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'group-service' });
    await connectDb({ uri: 'mongodb://host/db', serviceName: 'group-service' });

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1);
  });

  it('does not mark itself connected when mongoose.connect rejects', async () => {
    const { connectDb, mongooseMock } = await loadFresh();
    mongooseMock.connect.mockRejectedValueOnce(new Error('connection refused'));

    await expect(connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' })).rejects.toThrow(
      'connection refused'
    );

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' });
    expect(mongooseMock.connect).toHaveBeenCalledTimes(2);
  });

  /**
   * The driver retries internally for serverSelectionTimeoutMS, so anything that
   * reaches us is a real fault: one failure is one rejection. Callers exit
   * non-zero and the container restart policy takes it from there.
   */
  it('does not retry a failing connection', async () => {
    const { connectDb, mongooseMock, loggerMock } = await loadFresh();
    mongooseMock.connect.mockRejectedValue(new Error('auth failed'));

    await expect(connectDb({ uri: 'mongodb://host/db', serviceName: 'label-service' })).rejects.toThrow('auth failed');

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[label-service] MongoDB connection failed',
      expect.objectContaining({ error: 'auth failed' })
    );
  });

  it('lets concurrent callers share one connection attempt', async () => {
    const { connectDb, mongooseMock } = await loadFresh();

    await Promise.all([
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' }),
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' })
    ]);

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1);
  });

  it('registers reconnection listeners once connected', async () => {
    const { connectDb, mongooseMock } = await loadFresh();

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' });

    const events = mongooseMock.connection.on.mock.calls.map((call) => call[0]);
    expect(events).toEqual(expect.arrayContaining(['error', 'disconnected', 'reconnected']));
  });

  /**
   * The listeners only report state — the driver handles the reconnect itself —
   * so what matters is that a drop is audible at all, tagged with the service
   * that dropped it. Without these the only symptom is the health endpoint
   * flipping to "disconnected" with nothing in the log to explain it.
   */
  describe('connection listeners', () => {
    async function connectAndGetHandlers(serviceName: string) {
      const { connectDb, mongooseMock, loggerMock } = await loadFresh();
      return connectDb({ uri: 'mongodb://host/db', serviceName }).then(() => {
        const handlers = Object.fromEntries(mongooseMock.connection.on.mock.calls) as Record<
          string,
          (arg?: unknown) => void
        >;
        return { handlers, loggerMock };
      });
    }

    it('logs the service name and message on a connection error', async () => {
      const { handlers, loggerMock } = await connectAndGetHandlers('auth-service');

      handlers.error(new Error('socket hang up'));

      expect(loggerMock.error).toHaveBeenCalledWith('[auth-service] MongoDB connection error', {
        error: 'socket hang up'
      });
    });

    it('warns rather than errors on a disconnect, since the driver retries', async () => {
      const { handlers, loggerMock } = await connectAndGetHandlers('vision-service');

      handlers.disconnected();

      expect(loggerMock.warn).toHaveBeenCalledWith('[vision-service] MongoDB disconnected');
      expect(loggerMock.error).not.toHaveBeenCalled();
    });

    it('logs a reconnect', async () => {
      const { handlers, loggerMock } = await connectAndGetHandlers('label-service');

      handlers.reconnected();

      expect(loggerMock.info).toHaveBeenCalledWith('[label-service] MongoDB reconnected');
    });
  });
});
