import {
  createBaseApp,
  createHealthCheckHandler,
  errorHandler,
  STANDARD_CORS_ALLOWED_HEADERS
} from '@visin/backend-core';
import { createAdminRoutes } from './routes/adminRoutes';

/** Compose HTTP concerns; database startup lives in index.ts. */
export function createApp() {
  const app = createBaseApp({
    corsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS
  });
  app.get('/health', createHealthCheckHandler({ serviceName: 'admin-service', checkMongo: true }));
  app.use('/api/admin', createAdminRoutes());
  app.use(errorHandler);
  return app;
}
