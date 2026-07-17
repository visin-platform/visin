import type { Request, Response, NextFunction } from 'express';
import { errorHandler, asyncHandler } from '../../middleware/errorHandler';
import { NotFoundError, ForbiddenError } from '../../errors/HttpError';

jest.mock('../../logging/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const { logger } = jest.requireMock('../../logging/logger') as {
  logger: { warn: jest.Mock; error: jest.Mock };
};

const makeReq = () => ({ originalUrl: '/api/things/123', method: 'GET' }) as unknown as Request;

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

const next = jest.fn() as unknown as NextFunction;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('errorHandler', () => {
  it('maps an HttpError to its status code with name and message, logged as a warning', () => {
    const res = makeRes();

    errorHandler(new NotFoundError('Training not found'), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'NotFoundError',
      message: 'Training not found'
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps a ForbiddenError to 403', () => {
    const res = makeRes();

    errorHandler(new ForbiddenError('Private project'), makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it.each(['ValidationError', 'CastError'])('maps a Mongoose %s to 400', (name) => {
    const error = new Error('bad input');
    error.name = name;
    const res = makeRes();

    errorHandler(error, makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: name, message: 'bad input' });
  });

  it('treats an unrecognized error as a 500 and logs it with its stack', () => {
    const res = makeRes();
    const error = new Error('db exploded');

    errorHandler(error, makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.objectContaining({ error: 'db exploded', stack: error.stack })
    );
  });

  it('includes the real message and stack outside production', () => {
    process.env.NODE_ENV = 'development';
    const res = makeRes();
    const error = new Error('db exploded');

    errorHandler(error, makeReq(), res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'db exploded', stack: error.stack })
    );
  });

  it('hides the message and stack in production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();

    errorHandler(new Error('db exploded'), makeReq(), res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal server error',
      message: 'Something went wrong'
    });
  });
});

describe('asyncHandler', () => {
  it('forwards a rejected promise to next()', async () => {
    const error = new Error('async failure');
    const handler = asyncHandler(async () => {
      throw error;
    });
    const nextFn = jest.fn();

    handler(makeReq(), makeRes(), nextFn);
    await new Promise(process.nextTick);

    expect(nextFn).toHaveBeenCalledWith(error);
  });

  it('does not call next() when the handler resolves', async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    });
    const res = makeRes();
    const nextFn = jest.fn();

    handler(makeReq(), res, nextFn);
    await new Promise(process.nextTick);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(nextFn).not.toHaveBeenCalled();
  });
});
