import {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  BadGatewayError,
  GatewayTimeoutError
} from '../../errors/HttpError';

describe('HttpError', () => {
  it('carries the given status code and message', () => {
    const error = new HttpError(418, "I'm a teapot");
    expect(error.statusCode).toBe(418);
    expect(error.message).toBe("I'm a teapot");
    expect(error).toBeInstanceOf(Error);
  });

  it('sets name to the concrete subclass name', () => {
    expect(new HttpError(400, 'x').name).toBe('HttpError');
  });
});

describe.each([
  [BadRequestError, 400, 'Bad request'],
  [UnauthorizedError, 401, 'Unauthorized'],
  [ForbiddenError, 403, 'Access denied'],
  [NotFoundError, 404, 'Not found'],
  [ConflictError, 409, 'Conflict'],
  [TooManyRequestsError, 429, 'Too many requests'],
  [BadGatewayError, 502, 'Upstream service returned an unusable response'],
  [GatewayTimeoutError, 504, 'Upstream service timed out']
] as const)('%p', (ErrorClass, expectedStatus, defaultMessage) => {
  it(`defaults to status ${expectedStatus} and a sensible message`, () => {
    const error = new ErrorClass();
    expect(error.statusCode).toBe(expectedStatus);
    expect(error.message).toBe(defaultMessage);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(ErrorClass.name);
  });

  it('accepts a custom message', () => {
    const error = new ErrorClass('custom message');
    expect(error.statusCode).toBe(expectedStatus);
    expect(error.message).toBe('custom message');
  });
});
