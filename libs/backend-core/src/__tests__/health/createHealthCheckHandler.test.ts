import type { Request, Response } from 'express';
import { createHealthCheckHandler } from '../../health/createHealthCheckHandler';

jest.mock('mongoose', () => ({ connection: { readyState: 0 } }));

const mongooseMock = jest.requireMock('mongoose') as { connection: { readyState: number } };

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

const req = {} as Request;

beforeEach(() => {
  jest.clearAllMocks();
  mongooseMock.connection = { readyState: 0 };
});

describe('createHealthCheckHandler', () => {
  it('returns a plain 200 liveness response when checkMongo is off', async () => {
    const handler = createHealthCheckHandler({ serviceName: 'auth-service' });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', service: 'auth-service' })
    );
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('dependencies');
  });

  it('returns 200 with mongodb: connected when checkMongo is on and mongoose is connected', async () => {
    mongooseMock.connection.readyState = 1;
    const handler = createHealthCheckHandler({ serviceName: 'vision-service', checkMongo: true });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        service: 'vision-service',
        dependencies: { mongodb: 'connected' }
      })
    );
  });

  it('returns 503 with mongodb: disconnected when mongoose is not connected', async () => {
    mongooseMock.connection.readyState = 0;
    const handler = createHealthCheckHandler({ serviceName: 'vision-service', checkMongo: true });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', dependencies: { mongodb: 'disconnected' } })
    );
  });

  it('includes the description only when provided', async () => {
    mongooseMock.connection.readyState = 1;
    const withDescription = createHealthCheckHandler({
      serviceName: 'file-service',
      description: 'File storage service',
      checkMongo: true
    });
    const res = makeRes();

    await withDescription(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'File storage service' })
    );

    const withoutDescription = createHealthCheckHandler({ serviceName: 'file-service', checkMongo: true });
    const res2 = makeRes();

    await withoutDescription(req, res2);

    expect(res2.json.mock.calls[0][0]).not.toHaveProperty('description');
  });

  it('returns 503 with a generic error when reading the connection state throws', async () => {
    Object.defineProperty(mongooseMock, 'connection', {
      get: () => {
        throw new Error('mongoose exploded');
      },
      configurable: true
    });
    const handler = createHealthCheckHandler({ serviceName: 'group-service', checkMongo: true });
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', error: 'Health check failed' })
    );
  });
});
