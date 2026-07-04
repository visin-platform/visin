import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate';
import { BadRequestError } from '../../errors/HttpError';

/**
 * Express 5's `Request.prototype.query` is a getter with no setter, so a
 * plain mock object (which has no such trap) would let a naive
 * `req.query = parsed` implementation pass tests while still crashing in
 * production. Model that trap here so a regression to plain assignment
 * fails this suite too.
 */
const makeReq = (overrides: { body?: unknown; query?: unknown; params?: unknown } = {}): Request => {
  const req = {} as Request;
  Object.defineProperty(req, 'query', {
    value: overrides.query ?? {},
    configurable: true,
    enumerable: true
    // no `set` — matches Express 5's real prototype accessor
  });
  req.body = overrides.body ?? {};
  req.params = (overrides.params ?? {}) as Request['params'];
  return req;
};

const res = {} as Response;
const next = jest.fn() as unknown as NextFunction;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateRequest', () => {
  it('parses and coerces req.query despite it being a getter-only property', () => {
    const middleware = validateRequest({
      query: z.object({ page: z.coerce.number().int().default(1) })
    });
    const req = makeReq({ query: { page: '3' } });

    expect(() => middleware(req, res, next)).not.toThrow();

    expect(req.query).toEqual({ page: 3 });
    expect(next).toHaveBeenCalledWith();
  });

  it('applies query schema defaults when the field is absent', () => {
    const middleware = validateRequest({
      query: z.object({ page: z.coerce.number().int().default(1) })
    });
    const req = makeReq({ query: {} });

    middleware(req, res, next);

    expect(req.query).toEqual({ page: 1 });
    expect(next).toHaveBeenCalledWith();
  });

  it('parses req.body in place', () => {
    const middleware = validateRequest({
      body: z.object({ name: z.string().min(1) })
    });
    const req = makeReq({ body: { name: 'training-1' } });

    middleware(req, res, next);

    expect(req.body).toEqual({ name: 'training-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('parses req.params in place', () => {
    const middleware = validateRequest({
      params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) })
    });
    const req = makeReq({ params: { id: '507f1f77bcf86cd799439011' } });

    middleware(req, res, next);

    expect(req.params).toEqual({ id: '507f1f77bcf86cd799439011' });
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(BadRequestError) with a field-level message on invalid body', () => {
    const middleware = validateRequest({
      body: z.object({ name: z.string().min(1, 'Name is required') })
    });
    const req = makeReq({ body: { name: '' } });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.message).toContain('name');
    expect(err.message).toContain('Name is required');
  });

  it('calls next(BadRequestError) on invalid query params', () => {
    const middleware = validateRequest({
      query: z.object({ sortBy: z.enum(['name', 'createdAt']) })
    });
    const req = makeReq({ query: { sortBy: 'not-a-real-field' } });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('rejects invalid params the same way', () => {
    const middleware = validateRequest({
      params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id format') })
    });
    const req = makeReq({ params: { id: 'not-an-object-id' } });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('validates body, query, and params together and only calls next() once on success', () => {
    const middleware = validateRequest({
      body: z.object({ name: z.string() }),
      query: z.object({ page: z.coerce.number().default(1) }),
      params: z.object({ id: z.string() })
    });
    const req = makeReq({ body: { name: 'x' }, query: { page: '2' }, params: { id: '1' } });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
