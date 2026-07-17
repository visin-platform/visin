jest.mock('mongoose', () => ({ connect: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../logging/logger', () => ({ logger: { info: jest.fn() } }));

// connectDb keeps a module-level "already connected" flag, so each test loads
// a fresh copy of the module (and the mongoose mock instance it captured).
function loadFresh() {
  let connectDb!: typeof import('../../db/connectDb').connectDb;
  let mongooseMock!: { connect: jest.Mock };
  let loggerMock!: { info: jest.Mock };
  jest.isolateModules(() => {
    mongooseMock = jest.requireMock('mongoose');
    loggerMock = (jest.requireMock('../../logging/logger') as { logger: { info: jest.Mock } }).logger;
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

    await expect(connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' })).rejects.toThrow(
      'connection refused'
    );

    await connectDb({ uri: 'mongodb://host/db', serviceName: 'auth-service' });
    expect(mongooseMock.connect).toHaveBeenCalledTimes(2);
  });
});
