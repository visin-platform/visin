import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, authenticateToken, assertRequiredEnv } from '@visin/backend-core';
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

connectDb({ serviceName: 'label-service' }).catch(err => logger.error('MongoDB connection error', { error: err.message }));

// Health check endpoint
app.get('/health', createHealthCheckHandler({
  serviceName: 'label-service',
  description: 'Image labeling service',
  checkMongo: true
}));

// No anonymous access anywhere: every /api route requires a signed-in user.
app.use('/api', authenticateToken);
app.use('/api/bundles', bundleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/me', meRoutes);

// Must be mounted last, after all routes
app.use(errorHandler);

// The import worker runs in-process alongside the API. Split it into its own
// container (same image, a worker-only entrypoint) if ingest starts competing
// with request handling for the event loop.
const importWorker = createImportWorker();

const PORT = process.env.PORT || 5008;
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
