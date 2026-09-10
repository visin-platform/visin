import { AsyncLocalStorage } from 'async_hooks';
import type { Request, RequestHandler } from 'express';

interface Context { request: Request; groups?: Promise<{ id: string; name: string }[]> }
export const requestIdentityContext = new AsyncLocalStorage<Context>();
// Keep the request, not an unverified copy of its headers. Authentication fills
// req.user downstream; consumers must match it to the service's actor ID.
export const identityContextMiddleware: RequestHandler = (req, _res, next) =>
  requestIdentityContext.run({ request: req }, next);
