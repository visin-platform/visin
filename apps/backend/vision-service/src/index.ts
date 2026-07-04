import express from 'express';
import path from 'path';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler } from '@visin/backend-core';
import datasetRoutes from './routes/datasetRoutes';
import trainingRoutes from './routes/trainingRoutes';
import epochRoutes from './routes/epochRoutes';
import configRoutes from './routes/configRoutes';
import analysisRoutes from './routes/analysisRoutes';
import datasetImageRoutes from './routes/datasetImageRoutes';
import testResultRoutes from './routes/testResultRoutes';
import visualizationRoutes from './routes/visualizationRoutes';
import benchmarkRoutes from './routes/benchmarkRoutes';
import comparisonRoutes from './routes/comparisonRoutes';
import projectRoutes from './routes/projectRoutes';
import apiTokenRoutes from './routes/apiTokenRoutes';
import imageCategoryRoutes from './routes/imageCategoryRoutes';
import { apiTokenMiddleware } from './middleware/apiTokenMiddleware';

// Connect to MongoDB
connectDb({ serviceName: 'vision-service' }).catch((err) => {
  logger.error('MongoDB connection error', { error: err.message });
  process.exit(1);
});

const PORT = process.env.PORT || 4010;

const app = createBaseApp({
  corsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  corsAllowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-correlation-id', 'x-session-id'],
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
app.use(apiTokenMiddleware);

// Routes
app.use('/api/datasets', datasetRoutes);
app.use('/api/trainings', trainingRoutes);
app.use('/api/epochs', epochRoutes);
app.use('/api/configs', configRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/dataset-images', datasetImageRoutes);
app.use('/api/test-results', testResultRoutes);
app.use('/api/visualizations', visualizationRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/comparisons', comparisonRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/api-tokens', apiTokenRoutes);
app.use('/api/image-categories', imageCategoryRoutes);

// Serve OpenAPI docs as static files
app.use('/api/docs', express.static(path.join(__dirname, '../docs')));

// Health check endpoint
app.get('/health', createHealthCheckHandler({ serviceName: 'vision-service' }));

// Must be mounted last, after all routes
app.use(errorHandler);

// Start the server
app.listen(PORT, () => logger.info(`Vision service started successfully on port ${PORT}`));

export default app;
