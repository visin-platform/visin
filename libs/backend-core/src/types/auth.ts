import type { ApiKeyContext } from '../apiKeys/middleware';

export interface UserPayload {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  roles?: string[];
  /**
   * Distinct group roles ('owner' | 'admin' | 'member') the user holds, from
   * group-service. Group ids are not carried: nothing reads them, and callers
   * needing the groups themselves query group-service directly.
   */
  groupRoles?: string[];
  tokenVersion?: number;
}

/**
 * Attaches `user` to every Express `Request` across services, replacing the
 * ad-hoc `(req as any).user` casts scattered through each service's own
 * local `authMiddleware.ts`. Services may still carry additional
 * request-scoped fields locally (e.g. auth-service's `dbUser`, file-service's
 * signed-URL params) — those stay local since they aren't meaningful outside
 * that service.
 *
 * `projectId` is set by an API-token auth middleware (e.g. vision-service's
 * `apiTokenMiddleware`) when the request authenticated via a project-scoped
 * token rather than a user JWT — write handlers must treat it as the
 * authoritative project, not a client-supplied `req.body.projectId`.
 *
 * `apiKey` is set by `apiKeyAuth` when the request arrived on a user API key
 * rather than a session. `user` is populated in that case too, so a handler
 * that only cares who is calling needs no change; `apiKey` being present is how
 * a handler tells that software is acting rather than a person.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
      projectId?: string;
      apiKey?: ApiKeyContext;
    }
  }
}
