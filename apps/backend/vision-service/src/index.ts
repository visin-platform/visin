import express from 'express';
import { identityContextMiddleware } from './middleware/requestIdentityContext';
import writeCapabilitiesRoutes from './routes/writeCapabilitiesRoutes';
import path from 'path';
import { createBaseApp, errorHandler, logger, connectDb, createHealthCheckHandler, assertRequiredEnv, apiKeyAuth } from '@visin/backend-core';
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
import findingRoutes from './routes/findingRoutes';
import { apiTokenMiddleware } from './middleware/apiTokenMiddleware';

// JWT_SECRET verifies user sessions; FILE_SERVICE_API_KEY authenticates every
// dataset-image/visualization storage call.
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'FILE_SERVICE_API_KEY']);

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
app.use(identityContextMiddleware, apiTokenMiddleware);

/**
 * User API keys (`vsn_live_…`), for non-browser callers like the MCP server.
 *
 * Mounted per route group rather than once globally, for two reasons. This
 * service answers for three scope domains — `vision` for runs and their
 * results, `dataset` for the data they were trained on, `analysis` for written
 * conclusions — so there is no single domain a global mount could name. And forgetting the guard on a route group added
 * later fails *closed*: keys simply don't authenticate there and the JWT
 * middleware answers 401, rather than the group silently accepting any key.
 *
 * `apiKeyAuth` runs ahead of each route's own authMiddleware/optionalAuthMiddleware
 * and cooperates with them through the `if (req.user) return next()` guard both
 * begin with. Read vs. write is derived from the HTTP method; the `readPaths`
 * entries are the comparison endpoints, which are POSTs that read two runs and
 * write nothing.
 */
const COMPARE_IS_A_READ = { readPaths: [/^\/compare(\/|$)/] };

app.use('/api/write-capabilities', writeCapabilitiesRoutes);
app.use('/api/datasets', apiKeyAuth('dataset'), datasetRoutes);
app.use('/api/trainings', apiKeyAuth('vision', COMPARE_IS_A_READ), trainingRoutes);
app.use('/api/epochs', apiKeyAuth('vision'), epochRoutes);
app.use('/api/configs', apiKeyAuth('vision'), configRoutes);
app.use('/api/analysis', apiKeyAuth('dataset', COMPARE_IS_A_READ), analysisRoutes);
app.use('/api/dataset-images', apiKeyAuth('dataset'), datasetImageRoutes);
app.use('/api/test-results', apiKeyAuth('vision', COMPARE_IS_A_READ), testResultRoutes);
app.use('/api/visualizations', apiKeyAuth('vision'), visualizationRoutes);
app.use('/api/benchmarks', apiKeyAuth('vision'), benchmarkRoutes);
app.use('/api/comparisons', apiKeyAuth('vision'), comparisonRoutes);
app.use('/api/projects', apiKeyAuth('vision'), projectRoutes);
// Deliberately no apiKeyAuth: this route group mints and revokes the
// project-scoped tokens the training pipeline authenticates with. Issuing a
// credential is a thing a person does while signed in, never something one
// credential should be able to do on behalf of another.
app.use('/api/api-tokens', apiTokenRoutes);
app.use('/api/image-categories', apiKeyAuth('dataset'), imageCategoryRoutes);
// Written conclusions. Its own scope domain, so an assistant can be granted
// "read my experiments and record what you conclude" without also being able to
// rename projects or retag runs.
app.use('/api/findings', apiKeyAuth('analysis'), findingRoutes);

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
    app.listen(PORT, () => logger.info(`Vision service started successfully on port ${PORT}`));
  })
  .catch((err: Error) => {
    logger.error('Failed to start vision-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });

export default app;
