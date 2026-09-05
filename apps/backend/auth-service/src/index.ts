import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, assertRequiredEnv } from '@visin/backend-core';
import authRoutes from './routes/authRoutes';
import oauthRoutes from './routes/oauthRoutes';
import { authorizationServerMetadata } from './controllers/oauthController';
import path from 'path';

// JWT_SECRET signs every session; INTERNAL_SERVICE_TOKEN gates /auth/internal/*.
// GOOGLE_CLIENT_ID is deliberately NOT required: password sign-in works without
// it, and demanding a Google project just to boot the service would block any
// self-hosted deployment that doesn't want Google in the loop. The Google
// endpoint reports its own absence instead (see googleAuthService).
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN']);

if (!process.env.GOOGLE_CLIENT_ID) {
  logger.warn('GOOGLE_CLIENT_ID is not set — Google sign-in is disabled, password sign-in still works');
}

// Same reasoning as GOOGLE_CLIENT_ID: this is the secret that encrypts the
// recoverable copy of an API key, and without it /auth/api-keys answers 501
// while every other route works. Requiring it to boot would block a deployment
// that has no interest in API keys at all. Only the service that *issues* keys
// needs it — verifying one runs off a SHA-256 digest.
if (!process.env.API_KEY_ENCRYPTION_SECRET) {
  logger.warn('API_KEY_ENCRYPTION_SECRET is not set — API keys are disabled, everything else works');
}

const PORT = process.env.PORT || 5001;

// createBaseApp already mounts cookieParser() — req.cookies is populated
// before this point.
const app = createBaseApp({
  corsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  corsAllowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id'],
  corsExposedHeaders: ['Content-Type', 'Content-Length', 'ETag', 'Cache-Control']
});

// Extra rate limit on the credential endpoints, on top of the general limiter.
// Password login is guessable in a way a Google id-token is not, so it gets a
// tighter budget than the shared one.
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use('/auth/validate', loginLimiter);

const passwordLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
app.use('/auth/login', passwordLimiter);
app.use('/auth/register', passwordLimiter);
app.use('/auth/setup', passwordLimiter);

// Serve static documentation files
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

// RFC 8414. Served at the issuer root, not under /oauth, because that is where
// a client looks for it — it is the first thing read in the flow and it is
// unauthenticated by design, revealing only which endpoints exist.
app.get('/.well-known/oauth-authorization-server', authorizationServerMetadata);

// Routes
app.use('/auth', authRoutes);
app.use('/oauth', oauthRoutes);

// Documentation root redirect
app.get('/docs', (req: Request, res: Response) => {
  res.redirect('/api/docs/index.html');
});

// Health check endpoint
app.get('/health', createHealthCheckHandler({
  serviceName: 'auth-service',
  description: 'Authentication and user management service',
  checkMongo: true
}));

// Must be mounted last, after all routes
app.use(errorHandler);

// Connect before binding the port: every route needs Mongo, so a service that
// can't reach it has nothing to serve, and listening anyway would pass the
// health check while failing every request. Exiting hands recovery to the
// container restart policy.
connectDb({ serviceName: 'auth-service' })
  .then(() => {
    app.listen(PORT, () => logger.info('Auth service started successfully', { port: PORT }));
  })
  .catch((err: Error) => {
    logger.error('Failed to start auth-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
