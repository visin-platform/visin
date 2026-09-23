import express from 'express';
import { apiKeyAuth, assertRequiredEnv, connectDb, createBaseApp, createHealthCheckHandler, errorHandler, logger, optionalAuth, STANDARD_CORS_ALLOWED_HEADERS, serve } from '@visin/backend-core';
import datasetRoutes from './routes/datasetRoutes';
import internalRoutes from './routes/internalRoutes';
import { createImportWorker } from './queue/importWorker';
import { resumeDeletions } from './services/deleteService';
import { closeImportQueue } from './queue/importQueue';

// JWT_SECRET verifies sessions; INTERNAL_SERVICE_TOKEN gates /internal and the
// group-service calls; FILE_SERVICE_API_KEY every storage call; REDIS_URL the
// import queue. Missing any of them should fail boot, not the first request.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'FILE_SERVICE_API_KEY', 'REDIS_URL']);

const PORT = process.env.PORT || 5010;

const app = createBaseApp({
  corsMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS,
  json: false
});
app.use(express.json({ limit: '1mb' }));

app.get('/health', createHealthCheckHandler({ serviceName: 'dataset-service', description: 'Datasets: zip upload, import, images', checkMongo: true }));

app.use('/internal', internalRoutes);
// `apiKeyAuth` lets a user API key (an MCP server) act with the `dataset`
// scope; `optionalAuth` attaches a session user when there is one. Reads are
// then gated per dataset by visibility, writes by `authenticateToken` per route.
app.use('/api/datasets', apiKeyAuth('dataset'), optionalAuth, datasetRoutes);

// Must be mounted last, after all routes
app.use(errorHandler);

// Connect before binding the port or starting the worker: both the API and the
// import worker need Mongo, and a service that can't reach it would only pull
// jobs off the queue to fail them. Exiting hands recovery to the restart policy.
connectDb({ serviceName: 'dataset-service' })
  .then(() => {
    // The import worker runs in-process alongside the API. Split it into its own
    // container (same image, a worker-only entrypoint) if imports start competing
    // with request handling for the event loop.
    const importWorker = createImportWorker();
    resumeDeletions()
      .then((count) => count && logger.info('Resumed dataset deletions', { count }))
      .catch((err: Error) => logger.error('Could not resume dataset deletions', { error: err.message }));
    // On redeploy, stop taking new work and let the in-flight import finish:
    // `worker.close()` waits for the active job. A hard kill is covered by
    // BullMQ's stalled-job recovery, and the import resumes where it stopped.
    serve(app, {
      port: PORT,
      serviceName: 'dataset-service',
      onShutdown: () => Promise.all([importWorker.close(), closeImportQueue()])
    });
  })
  .catch((err: Error) => {
    logger.error('Failed to start dataset-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
