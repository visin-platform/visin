import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { requestLogger } from '../../middleware/requestLogger';
import { errorHandler } from '../../middleware/errorHandler';
import { ForbiddenError } from '../../errors/HttpError';
import { redactRequestDiagnostic, safeRequestPath } from '../../logging/requestDiagnostics';

jest.mock('../../logging/logger', () => ({ logger: { http: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const { logger } = jest.requireMock('../../logging/logger');

beforeEach(() => jest.clearAllMocks());

describe('credential-free request diagnostics', () => {
  it.each([
    ['/api/files/123?signature=SIGNED_SECRET&code=CODE_SECRET', '/api/files/123'],
    ['/api/files/123?ToKeN=TOKEN_SECRET&token=SECOND_SECRET', '/api/files/123'],
    ['https://user:AUTHORITY_SECRET@example.com/api/files?token=TOKEN_SECRET', '/api/files'],
    ['//user:AUTHORITY_SECRET@example.com/api/files?token=TOKEN_SECRET', '/api/files'],
    ['http://[?token=TOKEN_SECRET', '[invalid request target]'],
    ['/api/files%3Ftoken%3DTOKEN_SECRET', '/api/files'],
    ['/api/files#TOKEN_SECRET', '/api/files'],
    ['/api/files', '/api/files']
  ])('logs a safe path on successful requests: %s', (originalUrl, path) => {
    const req = { originalUrl, method: 'GET', headers: { authorization: 'Bearer HEADER_SECRET' },
      cookies: { access_token: 'COOKIE_SECRET' } } as unknown as Request;
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const next = jest.fn();
    requestLogger(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    res.emit('finish');
    expect(logger.http).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^GET ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} 200 \\d+ms$`)));
    expect(JSON.stringify(logger.http.mock.calls)).not.toContain('_SECRET');
  });

  it.each([true, false])('removes URL and decoded value copies from errors (known=%s)', (known) => {
    const originalUrl = '/mounted/files?%73ignature=SIGNED_SECRET&code=ENCODED%2FSECRET&token=SPACE+SECRET&token=LAST?SECRET';
    const message = `Failed ${originalUrl}; values SIGNED_SECRET ENCODED/SECRET SPACE SECRET LAST?SECRET`;
    const error = known ? new ForbiddenError(message) : new Error(message);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(error, { originalUrl, method: 'GET' } as Request, res as unknown as Response, jest.fn());
    const calls = [...logger.warn.mock.calls, ...logger.error.mock.calls];
    expect(JSON.stringify(calls)).not.toContain('SECRET');
    expect(calls[0][1]).toEqual(expect.objectContaining({ url: '/mounted/files', method: 'GET' }));
    expect(res.status).toHaveBeenCalledWith(known ? 403 : 500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message }));
    expect(error.message).toBe(message);
  });

  it('redacts outbound signed URLs and URL userinfo from an unrelated request error', () => {
    const diagnostic = 'upstream https://user:AUTHORITY_SECRET@files.test/signed/123?signature=SIGNED_SECRET failed';
    expect(redactRequestDiagnostic(diagnostic, '/api/files')).toBe('upstream /signed/123 failed');
    expect(redactRequestDiagnostic('https://user:AUTHORITY_SECRET@files.test/path', '/api/files')).toBe('/path');
    expect(redactRequestDiagnostic(diagnostic, '/api/files?q=%3F')).toBe('upstream /signed/123 failed');
  });

  it('preserves useful benign messages, stack frames, and missing stacks', () => {
    const diagnostic = 'db exploded\n    at read (/app/service.ts:12:3)';
    expect(redactRequestDiagnostic(diagnostic, '/api/files?empty=&flag')).toBe(diagnostic);
    expect(redactRequestDiagnostic(undefined, '/')).toBeUndefined();
    expect(safeRequestPath('/api/files%23SECRET')).toBe('/api/files');
  });
});
