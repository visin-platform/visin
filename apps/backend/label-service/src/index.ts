import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, authenticateToken, optionalAuth, assertRequiredEnv, STANDARD_CORS_ALLOWED_HEADERS, serve } from '@visin/backend-core';
import jobRoutes from './routes/jobRoutes';
import taskRoutes from './routes/taskRoutes';
import meRoutes from './routes/meRoutes';

// The client modules call requireEnv() lazily, per request — asserting here
// turns a missing setting into a boot failure rather than a 500 mid-labeling.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'FILE_SERVICE_API_KEY', 'DATASET_SERVICE_URL']);

const app = createBaseApp({
  corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS
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
// per-route in jobs/tasks (mixed) and wholesale here for /me, which has
// no public surface at all.
app.use('/api', optionalAuth);
app.use('/api/jobs', jobRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/me', authenticateToken, meRoutes);

// Must be mounted last, after all routes
app.use(errorHandler);

const PORT = process.env.PORT || 5008;

// Connect before binding the port: every route reads and writes Mongo, so a
// service that can't reach it has nothing to serve. Exiting hands recovery to
// the container restart policy.
connectDb({ serviceName: 'label-service' })
  .then(() => {
    serve(app, { port: PORT, serviceName: 'label-service' });
  })
  .catch((err: Error) => {
    logger.error('Failed to start label-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });
