import {
  createBaseApp,
  createHealthCheckHandler,
  errorHandler,
  STANDARD_CORS_ALLOWED_HEADERS
} from '@visin/backend-core';
import { createGuestRoutes } from './routes/guestRoutes';
import { createServiceRoutes } from './routes/serviceRoutes';
import { PROVIDER_REPLAY_VERSION } from './services/providers';

/** Compose HTTP concerns; database startup and worker lifecycle live in bootstrap.ts. */
export function createApp() {
  const app = createBaseApp({ corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS });
  if (process.env.GUEST_TRUSTED_PROXY)
    app.set('trust proxy', process.env.GUEST_TRUSTED_PROXY.split(',').map((s) => s.trim()));
  app.use((_req, res, next) => {
    res.setHeader('X-Visin-Assistant-Replay', PROVIDER_REPLAY_VERSION);
    next();
  });
  app.get(
    '/health',
    createHealthCheckHandler({ serviceName: 'assistant-service', description: 'Vivi, the assistants', checkMongo: true })
  );
  app.use('/api/assistant/guest', createGuestRoutes());
  app.use('/api/assistant', createServiceRoutes());
  app.use(errorHandler);
  return app;
}

/**
 * What the worker program (`index.worker.ts`) serves: its health and metrics (`createBaseApp`), so the same probes and
 * scrape that watch the API watch it. Nothing else is reachable, and the compose service publishes no port.
 */
export function createWorkerApp() {
  const app = createBaseApp({ corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS });
  app.get(
    '/health',
    createHealthCheckHandler({ serviceName: 'assistant-worker', description: 'Vivi analysis worker', checkMongo: true })
  );
  app.use(errorHandler);
  return app;
}
