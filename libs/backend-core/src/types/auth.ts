export interface UserPayload {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  roles?: string[];
  isApproved?: boolean;
  groups?: string[];
  tokenVersion?: number;
}

/**
 * Attaches `user` to every Express `Request` across services, replacing the
 * ad-hoc `(req as any).user` casts scattered through each service's own
 * local `authMiddleware.ts`. Services may still carry additional
 * request-scoped fields locally (e.g. auth-service's `dbUser`, file-service's
 * signed-URL params) — those stay local since they aren't meaningful outside
 * that service.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}
