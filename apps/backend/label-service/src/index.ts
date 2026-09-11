import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, authenticateToken, optionalAuth, assertRequiredEnv } from '@visin/backend-core';
import jobRoutes from './routes/jobRoutes';
import bundleRoutes from './routes/bundleRoutes';
import taskRoutes from './routes/taskRoutes';
import meRoutes from './routes/meRoutes';
import { createImportWorker } from './queue/importWorker';
import { closeImportQueue } from './queue/importQueue';

// The two client modules call requireEnv() lazily, per request — asserting
// here turns a missing token into a boot failure rather than a 500 mid-ingest.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'FILE_SERVICE_API_KEY', 'REDIS_URL']);

const app = createBaseApp({
  corsAllowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id']
});

// Health check endpoint
app.get('/health', createHealthCheckHandler({
  serviceName: 'label-service',
  description: 'Image labeling service',
  checkMongo: true
}));

// Job reads enforce group membership or explicit active publication. Writing
// always requires authentication. `optionalAuth` only attaches `req.user` when a valid cookie is
// there; the routers that must have one apply `authenticateToken` themselves,
// per-route in jobs/tasks (mixed) and wholesale here for bundles and /me, which
// have no public surface at all.
app.use('/api', optionalAuth);
app.use('/api/bundles', authenticateToken, bundleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/me', authenticateToken, meRoutes);

// Must be mounted last, after all routes
app.use(errorHandler);

const PORT = process.env.PORT || 5008;

// Connect before binding the port or starting the worker: both the API routes
// and the import worker read and write Mongo, so a service that can't reach it
// has nothing to serve and would only pull jobs off the queue to fail them.
// Exiting hands recovery to the container restart policy.
connectDb({ serviceName: 'label-service' })
  .then(() => {
    // The import worker runs in-process alongside the API. Split it into its own
    // container (same image, a worker-only entrypoint) if ingest starts competing
    // with request handling for the event loop.
    const importWorker = createImportWorker();

    const server = app.listen(PORT, () => logger.info('Label service started successfully', { port: PORT }));

    // On redeploy, stop taking new work and let the in-flight ingest finish rather
    // than being killed mid-zip: `worker.close()` waits for the active job. Anything
    // still queued is picked up by the next process, and a hard kill is covered by
    // BullMQ's stalled-job recovery.
    const shutdown = (signal: string) => {
      logger.info('Shutting down label-service', { signal });
      server.close();
      Promise.all([importWorker.close(), closeImportQueue()])
        .catch((err: Error) => logger.error('Shutdown error', { error: err.message }))
        .finally(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err: Error) => {
    logger.error('Failed to start label-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });
