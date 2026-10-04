import { stallSilentTrainings } from './services/trainingHeartbeatService';
import express from 'express';
import { jsonBody } from './middleware/bodyLimit';
import { identityContextMiddleware } from './middleware/requestIdentityContext';
import path from 'path';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, assertRequiredEnv, STANDARD_CORS_ALLOWED_HEADERS, serve, startSweeper } from '@visin/backend-core';
import { API_ROUTE_GROUPS } from './routes/apiRoutes';
import internalRoutes from './routes/internalRoutes';
import { purgeExpiredTrash } from './services/purgeService';

// JWT_SECRET verifies user sessions; FILE_SERVICE_API_KEY authenticates every
// dataset-image/visualization storage call; INTERNAL_SERVICE_TOKEN gates
// /internal/*, which auth-service calls when issuing a project-limited API key; AUTH_SERVICE_URL is where
// owners' names and avatars are asked for (best effort: a list is shown without them if it cannot answer).
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'FILE_SERVICE_API_KEY', 'INTERNAL_SERVICE_TOKEN', 'AUTH_SERVICE_URL']);

const PORT = process.env.PORT || 4010;

const app = createBaseApp({
  corsMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS,
  corsExposedHeaders: ['Content-Disposition'],
  json: false
});

// Ingestion routes carry large result payloads; everything else gets the smaller default (see bodyLimit.ts).
app.use(jsonBody);

// Global Middleware
app.use(identityContextMiddleware);

app.use('/internal', internalRoutes);

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
    // Projects and trainings trashed more than 30 days ago are deleted: hourly, and once now.
    const trashSweeper = startSweeper({ name: 'vision-trash-purge', run: async () => void (await purgeExpiredTrash()) });
    const runSweeper = startSweeper({ name: 'vision-stalled-runs', everyMs: 60_000, run: async () => void (await stallSilentTrainings()) });
    serve(app, { port: PORT, serviceName: 'vision-service', onShutdown: async () => { await trashSweeper.stop(); await runSweeper.stop(); } });
  })
  .catch((err: Error) => {
    logger.error('Failed to start vision-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
