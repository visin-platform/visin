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
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service', maxAttempts: 1 })
    ).rejects.toThrow('connection refused');

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' });
    expect(mongooseMock.connect).toHaveBeenCalledTimes(2);
  });

  it('retries a failing connection until it succeeds', async () => {
    const { connectDb, mongooseMock, loggerMock } = loadFresh();
    mongooseMock.connect
      .mockRejectedValueOnce(new Error('getaddrinfo EAI_AGAIN'))
      .mockRejectedValueOnce(new Error('getaddrinfo EAI_AGAIN'))
      .mockResolvedValueOnce(undefined);

    await connectDb({
      uri: 'mongodb://host/db',
      serviceName: 'group-service',
      initialDelayMs: 0
    });

    expect(mongooseMock.connect).toHaveBeenCalledTimes(3);
    expect(loggerMock.warn).toHaveBeenCalledTimes(2);
    expect(loggerMock.info).toHaveBeenCalledWith('[group-service] MongoDB connected');
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    const { connectDb, mongooseMock, loggerMock } = loadFresh();
    mongooseMock.connect.mockRejectedValue(new Error('auth failed'));

    await expect(
      connectDb({
        uri: 'mongodb://host/db',
        serviceName: 'label-service',
        maxAttempts: 3,
        initialDelayMs: 0
      })
    ).rejects.toThrow('auth failed');

    expect(mongooseMock.connect).toHaveBeenCalledTimes(3);
    expect(loggerMock.error).toHaveBeenCalledWith(
      '[label-service] MongoDB connection failed, giving up',
      expect.objectContaining({ attempt: 3 })
    );
  });

  it('caps the backoff delay at maxDelayMs', async () => {
    const { connectDb, mongooseMock, loggerMock } = loadFresh();
    mongooseMock.connect
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(undefined);

    await connectDb({
      uri: 'mongodb://host/db',
      serviceName: 'vision-service',
      initialDelayMs: 1,
      maxDelayMs: 2
    });

    const delays = loggerMock.warn.mock.calls.map((call) => (call[1] as { delayMs: number }).delayMs);
    expect(delays).toEqual([1, 2, 2]);
  });

  it('lets concurrent callers share one retry loop', async () => {
    const { connectDb, mongooseMock } = loadFresh();
    mongooseMock.connect.mockRejectedValueOnce(new Error('not ready')).mockResolvedValueOnce(undefined);

    await Promise.all([
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service', initialDelayMs: 0 }),
      connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service', initialDelayMs: 0 })
    ]);

    expect(mongooseMock.connect).toHaveBeenCalledTimes(2);
  });

  it('registers reconnection listeners once connected', async () => {
    const { connectDb, mongooseMock } = loadFresh();

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' });

    const events = mongooseMock.connection.on.mock.calls.map((call) => call[0]);
    expect(events).toEqual(expect.arrayContaining(['error', 'disconnected', 'reconnected']));
  });
});
