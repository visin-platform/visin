import { assertRequiredEnv, connectDb, serve, logger } from '@visin/backend-core';
import { createApp } from './app';
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'AUTH_SERVICE_URL', 'CHAT_SERVICE_URL', 'GROUP_SERVICE_URL']);
void connectDb({ serviceName: 'admin-service' })
  .then(() => {
    serve(createApp(), { port: process.env.PORT || 5016, serviceName: 'admin-service' });
  })
  .catch((error: Error) => {
    logger.error('Admin startup failed', { error: error.message });
    process.exitCode = 1;
  });
