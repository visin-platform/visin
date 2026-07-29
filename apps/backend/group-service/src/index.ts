import express from 'express';
import path from 'path';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, assertRequiredEnv } from '@visin/backend-core';
import { authenticateToken } from './middleware/authMiddleware';
import groupRoutes from './routes/groupRoutes';

// Without INTERNAL_SERVICE_TOKEN every /api/groups route reachable by another
// service 500s at request time instead of failing here.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'INTERNAL_SERVICE_TOKEN']);

const app = createBaseApp({
  corsAllowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id']
});

connectDb({ serviceName: 'group-service' }).catch(err => logger.error('MongoDB connection error', { error: err.message }));

// Health check endpoint
app.get('/health', createHealthCheckHandler({
  serviceName: 'group-service',
  description: 'Group collaboration service',
  checkMongo: true
}));

// Serve OpenAPI docs as static files (before auth middleware)
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

app.use('/api', authenticateToken);
app.use('/api/groups', groupRoutes);

// Must be mounted last, after all routes
app.use(errorHandler);

const PORT = process.env.PORT || 5006;
app.listen(PORT, () => logger.info('Group service started successfully', { port: PORT }));
