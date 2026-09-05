import { Request, Response } from 'express';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  createApiKey,
  deleteApiKey,
  isEncryptionConfigured,
  listApiKeys,
  revealApiKey,
  revokeApiKey,
  logger
} from '@visin/backend-core';
import type { ApiKeyScope } from '@visin/backend-core';
import { displayName } from '../services/sessionService';

/**
 * Issuing and managing the API keys a non-browser client acts with — an MCP
 * server driving an assistant, a script, a CI job.
 *
 * auth-service owns this because it is the service that already knows who
 * someone is. Every other service only ever *verifies* a presented key, which
 * needs nothing but the digest.
 */

/**
 * Refuse cleanly when the deployment cannot store a recoverable copy.
 *
 * `API_KEY_ENCRYPTION_SECRET` is deliberately not in `assertRequiredEnv`, for
 * the same reason `GOOGLE_CLIENT_ID` is not: demanding it just to boot would
 * block a self-hosted deployment that has no interest in API keys, when every
 * other part of the service works fine without it. So the feature reports its
 * own absence rather than the process refusing to start — and it does so as a
 * 501 with an actionable message rather than a 500 from a throw deep inside
 * scrypt.
 */
function assertConfigured(res: Response): boolean {
  if (isEncryptionConfigured()) return true;

  logger.warn('API key requested but API_KEY_ENCRYPTION_SECRET is not set');
  res.status(501).json({
    success: false,
    message:
      'API keys are not enabled on this deployment. Set API_KEY_ENCRYPTION_SECRET on auth-service to turn them on.'
  });
  return false;
}

/** The signed-in user, or a 401 — every route here is the caller's own keys. */
function requireUser(req: Request): { id: string; email: string; name: string } {
  if (!req.user?.id) {
    throw new UnauthorizedError('Not authenticated');
  }

  const email = req.user.email ?? req.dbUser?.email ?? '';
  const name = req.dbUser ? displayName(req.dbUser) : (req.user.name ?? email);

  return { id: req.user.id, email, name };
}

export const createKey = async (req: Request, res: Response): Promise<void> => {
  if (!assertConfigured(res)) return;

  const user = requireUser(req);
  const { name, scopes, expiresInDays } = req.body as {
    name: string;
    scopes: ApiKeyScope[];
    expiresInDays?: number;
  };

  // A key that reaches nothing would authenticate and then be refused every
  // route — a confusing way to discover a mistake made in a form.
  if (scopes.length === 0) {
    throw new BadRequestError('Choose at least one permission for this key');
  }

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const { summary, token } = await createApiKey({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    name,
    scopes,
    expiresAt
  });

  logger.info('API key created', { userId: user.id, keyId: summary.id, scopes });

  res.status(201).json({
    success: true,
    message: 'API key created',
    data: {
      key: summary,
      // The only response that carries the secret without an explicit reveal.
      token
    }
  });
};

export const listKeys = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  res.json({ success: true, data: await listApiKeys(user.id) });
};

/**
 * Read a key back in the clear.
 *
 * A POST rather than a GET even though it reads: it mutates (the reveal is
 * counted and timestamped), and a URL that returns a live credential is one
 * that ends up in a browser history, a referrer header and an access log.
 */
export const revealKey = async (req: Request, res: Response): Promise<void> => {
  if (!assertConfigured(res)) return;

  const user = requireUser(req);
  const token = await revealApiKey(user.id, req.params.id as string);
  if (!token) {
    throw new NotFoundError('API key not found');
  }

  logger.info('API key revealed', { userId: user.id, keyId: req.params.id });

  res.json({ success: true, data: { token } });
};

export const revokeKey = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const summary = await revokeApiKey(user.id, req.params.id as string);
  if (!summary) {
    throw new NotFoundError('API key not found');
  }

  logger.info('API key revoked', { userId: user.id, keyId: req.params.id });

  res.json({ success: true, message: 'API key revoked', data: summary });
};

/**
 * Remove the record entirely.
 *
 * Separate from revoking, and the lesser of the two: revoking is what stops a
 * key working while leaving evidence it existed. Deleting is for tidying up a
 * key that was already revoked, or one created by mistake.
 */
export const removeKey = async (req: Request, res: Response): Promise<void> => {
  const user = requireUser(req);
  const deleted = await deleteApiKey(user.id, req.params.id as string);
  if (!deleted) {
    throw new NotFoundError('API key not found');
  }

  logger.info('API key deleted', { userId: user.id, keyId: req.params.id });

  res.json({ success: true, message: 'API key deleted' });
};
