import {
  createBaseApp,
  createHealthCheckHandler,
  errorHandler,
  STANDARD_CORS_ALLOWED_HEADERS
} from '@visin/backend-core';
import express from 'express';
import { createChatRoutes } from './routes/chatRoutes';

/**
 * An answer the assistant service publishes carries its text and a record of every lookup and thought behind it,
 * which can be more than the 100kb a person's request is held to. Refusing one would lose the answer for good.
 */
const ASSISTANT_BODY_LIMIT = '2mb';

/** Compose HTTP concerns; database startup lives in bootstrap.ts. */
export function createApp() {
  const app = createBaseApp({ corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS, json: false });
  // The larger limit first, for the assistant service's calls only (they still need the internal token); once a
  // body is parsed, the general parser leaves it alone.
  app.use('/api/chat/internal/assistant', express.json({ limit: ASSISTANT_BODY_LIMIT }));
  app.use(express.json());
  app.get(
    '/health',
    createHealthCheckHandler({ serviceName: 'chat-service', description: 'Research conversations', checkMongo: true })
  );
  app.use('/api/chat', createChatRoutes());
  app.use(errorHandler);
  return app;
}
