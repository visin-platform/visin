import express from 'express';
import { identityContextMiddleware } from './middleware/requestIdentityContext';
import path from 'path';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, assertRequiredEnv, STANDARD_CORS_ALLOWED_HEADERS, serve } from '@visin/backend-core';
import { API_ROUTE_GROUPS } from './routes/apiRoutes';
import { apiTokenMiddleware } from './middleware/apiTokenMiddleware';

// JWT_SECRET verifies user sessions; FILE_SERVICE_API_KEY authenticates every
// dataset-image/visualization storage call.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'FILE_SERVICE_API_KEY']);

const PORT = process.env.PORT || 4010;

const app = createBaseApp({
  corsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS,
  json: false
});

// Training/epoch/benchmark/test-result ingestion can carry large result payloads;
// everything else (projects, comparisons, configs, ...) gets the smaller default.
const LARGE_PAYLOAD_PREFIXES = ['/api/epochs', '/api/benchmarks', '/api/test-results', '/api/trainings'];
app.use((req, res, next) => {
  const limit = LARGE_PAYLOAD_PREFIXES.some(prefix => req.path.startsWith(prefix)) ? '50mb' : '1mb';
  express.json({ limit })(req, res, next);
});

// Global Middleware
app.use(identityContextMiddleware, apiTokenMiddleware);

// Route groups, each behind its own user-API-key guard (see apiRoutes.ts)
for (const { path: mountPath, guards, router } of API_ROUTE_GROUPS) {
  app.use(mountPath, ...guards, router);
}

// Serve OpenAPI docs as static files
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

// Health check endpoint
app.get('/health', createHealthCheckHandler({ serviceName: 'vision-service' }));

// Must be mounted last, after all routes
app.use(errorHandler);

// Connect before binding the port: every route needs Mongo, so a service that
// can't reach it has nothing to serve, and listening anyway would pass the
// health check while failing every request. Exiting hands recovery to the
// container restart policy.
connectDb({ serviceName: 'vision-service' })
  .then(() => {
    serve(app, { port: PORT, serviceName: 'vision-service' });
  })
  .catch((err: Error) => {
    logger.error('Failed to start vision-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
