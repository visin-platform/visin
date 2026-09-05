// @visin/backend-core - Shared backend functionality for Visin services

// Types
export type { UserPayload } from './types/auth';

// Config
export { requireEnv, assertRequiredEnv } from './config/env';

// Errors
export {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  BadGatewayError,
  GatewayTimeoutError
} from './errors/HttpError';

// HTTP client
export { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS, TRANSFER_FETCH_TIMEOUT_MS } from './http/fetchWithTimeout';
export type { FetchWithTimeoutInit } from './http/fetchWithTimeout';

// Logging
export { logger } from './logging/logger';

// Middleware
export { authenticateToken, optionalAuth } from './middleware/authMiddleware';
export {
  requireInternalServiceToken,
  validateInternalServiceToken,
  allowUserOrInternalService
} from './middleware/internalServiceAuth';
export type { InternalServiceRequest } from './middleware/internalServiceAuth';
export { errorHandler, asyncHandler } from './middleware/errorHandler';
export { securityHeaders, createRateLimiter, standardRateLimiter, strictRateLimiter } from './middleware/security';
export { requestLogger } from './middleware/requestLogger';
export { validateRequest } from './middleware/validate';
export type { RequestSchemas } from './middleware/validate';

// Re-exported so services can author zod schemas without their own direct
// dependency on zod — one version, declared once, in this package.
export { z } from 'zod';

// API keys — the credential a non-browser client (an MCP server, a script)
// acts as a user with. Distinct from vision-service's project-scoped ApiToken.
export { ApiKey } from './apiKeys/ApiKey';
export type { IApiKey } from './apiKeys/ApiKey';
export {
  generateKey,
  parseKey,
  looksLikeApiKey,
  secretMatches,
  displayPrefix,
  sha256,
  encryptSecret,
  decryptSecret,
  isEncryptionConfigured,
  resetEncryptionKeyCache
} from './apiKeys/crypto';
export type { GeneratedKey, ParsedKey, SealedSecret } from './apiKeys/crypto';
export {
  createApiKey,
  listApiKeys,
  revealApiKey,
  revokeApiKey,
  deleteApiKey,
  verifyApiKey
} from './apiKeys/service';
export type { CreateApiKeyInput, CreatedApiKey } from './apiKeys/service';
export { apiKeyAuth } from './apiKeys/middleware';
export type { ApiKeyContext, ApiKeyAuthOptions } from './apiKeys/middleware';
export { API_KEY_SCOPES, isApiKeyScope, readScope, writeScope } from './apiKeys/types';
export type {
  ApiKeyScope,
  ApiKeyDomain,
  ApiKeySummary,
  ApiKeyRejection,
  ApiKeyVerification
} from './apiKeys/types';

// OAuth 2.1 — the flow that lets an assistant connect over MCP without a
// long-lived key. Access tokens are short JWTs; revocation acts on the refresh
// token, which is the half that persists.
export { OAuthClient, AuthorizationCode, RefreshToken } from './oauth/models';
export type { IOAuthClient, IAuthorizationCode, IRefreshToken } from './oauth/models';
export {
  registerClient,
  findClient,
  isRegisteredRedirect,
  issueAuthorizationCode,
  redeemAuthorizationCode,
  issueRefreshToken,
  redeemRefreshToken,
  revokeRefreshTokensForUser,
  listConnections
} from './oauth/service';
export type {
  RegisterClientInput,
  RegisteredClient,
  IssueCodeInput,
  CodeRejection,
  CodeRedemption,
  RefreshRedemption,
  Connection
} from './oauth/service';
export {
  mintAccessToken,
  verifyAccessToken,
  parseScopes,
  isAccessTokenClaims,
  ACCESS_TOKEN_TYPE
} from './oauth/tokens';
export type {
  AccessTokenClaims,
  MintAccessTokenInput,
  MintedAccessToken,
  AccessTokenVerification
} from './oauth/tokens';

// Database
export { connectDb } from './db/connectDb';
export type { ConnectDbOptions } from './db/connectDb';

// App factory
export { createBaseApp } from './app/createBaseApp';
export type { CreateBaseAppOptions } from './app/createBaseApp';

// Health check
export { createHealthCheckHandler } from './health/createHealthCheckHandler';
export type { CreateHealthCheckHandlerOptions } from './health/createHealthCheckHandler';
