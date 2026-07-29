import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, assertRequiredEnv } from '@visin/backend-core';
import authRoutes from './routes/authRoutes';
import path from 'path';

// JWT_SECRET signs every session; GOOGLE_CLIENT_ID is the sign-in audience;
// INTERNAL_SERVICE_TOKEN gates /auth/internal/*.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'INTERNAL_SERVICE_TOKEN']);

const PORT = process.env.PORT || 5001;

// createBaseApp already mounts cookieParser() — req.cookies is populated
// before this point.
const app = createBaseApp({
  corsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  corsAllowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id'],
  corsExposedHeaders: ['Content-Type', 'Content-Length', 'ETag', 'Cache-Control']
});

// Extra rate limit on the login endpoint, on top of the general limiter
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use('/auth/validate', loginLimiter);

// Serve static documentation files
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

// Routes
app.use('/auth', authRoutes);

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

// Connect DB then start server
connectDb({ serviceName: 'auth-service' })
  .then(() => {
    app.listen(PORT, () => logger.info('Auth service started successfully', { port: PORT }));
  })
  .catch((err) => {
    logger.error('Failed to start auth-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
