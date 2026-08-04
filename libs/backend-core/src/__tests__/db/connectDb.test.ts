jest.mock('mongoose', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  connection: { on: jest.fn() }
}));
jest.mock('../../logging/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

type LoggerMock = { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

// connectDb keeps a module-level "already connected" flag, so each test loads
// a fresh copy of the module (and the mongoose mock instance it captured).
function loadFresh() {
  let connectDb!: typeof import('../../db/connectDb').connectDb;
  let mongooseMock!: { connect: jest.Mock; connection: { on: jest.Mock } };
  let loggerMock!: LoggerMock;
  jest.isolateModules(() => {
    mongooseMock = jest.requireMock('mongoose');
    loggerMock = (jest.requireMock('../../logging/logger') as { logger: LoggerMock }).logger;
    connectDb = (jest.requireActual('../../db/connectDb') as typeof import('../../db/connectDb')).connectDb;
  });
  return { connectDb, mongooseMock, loggerMock };
}

const ORIGINAL_MONGODB_URI = process.env.MONGODB_URI;

beforeEach(() => {
  jest.clearAllMocks();
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
    const { connectDb, mongooseMock } = loadFresh();

    await expect(connectDb({ serviceName: 'auth-service' })).rejects.toThrow('MONGODB_URI not set');
    expect(mongooseMock.connect).not.toHaveBeenCalled();
  });

  it('connects with an explicitly passed uri and logs the service name', async () => {
    const { connectDb, mongooseMock, loggerMock } = loadFresh();

    await connectDb({ uri: 'mongodb://explicit-host/db', serviceName: 'vision-service' });

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://explicit-host/db');
    expect(loggerMock.info).toHaveBeenCalledWith('[vision-service] MongoDB connected');
  });

  it('falls back to process.env.MONGODB_URI when no uri option is given', async () => {
    const { connectDb, mongooseMock } = loadFresh();
    process.env.MONGODB_URI = 'mongodb://env-host/db';

    await connectDb({ serviceName: 'file-service' });

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://env-host/db');
  });

  it('is a no-op on a second call once connected', async () => {
    const { connectDb, mongooseMock } = loadFresh();

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'group-service' });
    await connectDb({ uri: 'mongodb://host/db', serviceName: 'group-service' });

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1);
  });

  it('does not mark itself connected when mongoose.connect rejects', async () => {
    const { connectDb, mongooseMock } = loadFresh();
    mongooseMock.connect.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' })
    ).rejects.toThrow('connection refused');

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' });
    expect(mongooseMock.connect).toHaveBeenCalledTimes(2);
  });

  /**
   * The driver retries internally for serverSelectionTimeoutMS, so anything that
   * reaches us is a real fault: one failure is one rejection. Callers exit
   * non-zero and the container restart policy takes it from there.
   */
  it('does not retry a failing connection', async () => {
    const { connectDb, mongooseMock, loggerMock } = loadFresh();
    mongooseMock.connect.mockRejectedValue(new Error('auth failed'));

    await expect(
      connectDb({ uri: 'mongodb://host/db', serviceName: 'label-service' })
    ).rejects.toThrow('auth failed');

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[label-service] MongoDB connection failed',
      expect.objectContaining({ error: 'auth failed' })
    );
  });

  it('lets concurrent callers share one connection attempt', async () => {
    const { connectDb, mongooseMock } = loadFresh();

    await Promise.all([
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' }),
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' })
    ]);

    expect(mongooseMock.connect).toHaveBeenCalledTimes(1);
  });

  it('registers reconnection listeners once connected', async () => {
    const { connectDb, mongooseMock } = loadFresh();

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
    function connectAndGetHandlers(serviceName: string) {
      const { connectDb, mongooseMock, loggerMock } = loadFresh();
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
