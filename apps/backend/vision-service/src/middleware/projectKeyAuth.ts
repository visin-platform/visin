import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { apiKeyAuth, type ApiKeyAuthOptions, type ApiKeyDomain } from '@visin/backend-core';
import { projectTokenContext } from './projectTokenContext';

/**
 * backend-core's `apiKeyAuth`, plus the project limit it leaves to the service.
 *
 * A key limited to one project runs the rest of the request in the project
 * context, so every check that confines a project credential (`tokenProjectId`,
 * `isWithinTokenScope`, `requireUserCredential`) confines it. It keeps its
 * owner's real permissions in that project, groups included.
 */
export function projectKeyAuth(domain: ApiKeyDomain, options?: ApiKeyAuthOptions): RequestHandler {
  const authenticate = apiKeyAuth(domain, options);

  return (req: Request, res: Response, next: NextFunction) =>
    authenticate(req, res, (error?: unknown) => {
      if (error) return next(error);
      const projectId = req.apiKey?.projectId;
      if (!projectId || !req.user) return next();
      req.projectId = projectId;
      return projectTokenContext.run({ projectId, userId: req.user.id }, next);
    });
}
