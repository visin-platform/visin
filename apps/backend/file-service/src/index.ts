import { createBaseApp, errorHandler, logger, createHealthCheckHandler, assertRequiredEnv } from '@visin/backend-core';
import routes from './routes/routes';

// API key authenticates internal callers; HMAC secret signs the browser-direct
// upload/download URLs.
assertRequiredEnv(['FILE_SERVICE_API_KEY', 'FILE_SERVICE_HMAC_SECRET']);

const PORT = process.env.PORT || 5002;

// No blanket express.json() here: upload routes stream raw binary bodies
// directly in their controllers, so JSON parsing is applied per-route (in
// routes.ts) only on the handful of endpoints that actually expect a JSON
// body — a global path-guessing middleware previously skipped JSON parsing
// for any PUT under '/internal/files/', which also unintentionally matched
// PUT /internal/files/folder and silently dropped its request body.
const app = createBaseApp({ json: false });

// Health check
app.get('/health', createHealthCheckHandler({ serviceName: 'file-service' }));

// All file routes
app.use('/', routes);

// Must be mounted last, after all routes
app.use(errorHandler);

app.listen(PORT, () => logger.info(`File service started on port ${PORT}`));

export default app;
