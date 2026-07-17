import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, authenticateToken } from '@visin/backend-core';
import jobRoutes from './routes/jobRoutes';
import bundleRoutes from './routes/bundleRoutes';
import taskRoutes from './routes/taskRoutes';
import meRoutes from './routes/meRoutes';

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

const PORT = process.env.PORT || 5008;
app.listen(PORT, () => logger.info('Label service started successfully', { port: PORT }));
