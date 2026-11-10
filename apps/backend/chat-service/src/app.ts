import {
  createBaseApp,
  createHealthCheckHandler,
  errorHandler,
  STANDARD_CORS_ALLOWED_HEADERS
} from '@visin/backend-core';
import { PROVIDER_REPLAY_VERSION } from './services/providers';
import { createChatRoutes } from './routes/chatRoutes';

/** Compose HTTP concerns; database startup and worker lifecycle live in index.ts. */
export function createApp() {
  const app = createBaseApp({ corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS });
  app.use((_req, res, next) => {
    res.setHeader('X-Visin-Chat-Replay', PROVIDER_REPLAY_VERSION);
    next();
  });
  app.get(
    '/health',
    createHealthCheckHandler({ serviceName: 'chat-service', description: 'Research conversations', checkMongo: true })
  );
  app.use('/api/chat', createChatRoutes());
  app.use(errorHandler);
  return app;
}
