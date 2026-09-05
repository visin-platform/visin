import { assertRequiredEnv, connectDb, logger } from '@visin/backend-core';
import app from './app';

/**
 * MongoDB is needed for one thing only: verifying the API key a request arrives
 * with. Every read and write goes over HTTP to vision-service, so this process
 * holds no domain data of its own — which is also why it needs neither
 * `JWT_SECRET` nor `API_KEY_ENCRYPTION_SECRET`. It never mints a credential and
 * never reads the encrypted copy of one; the digest is enough to check a key.
 *
 * `VISION_SERVICE_URL` is asserted rather than left to fail lazily: without it
 * the service boots healthy and then fails every single tool call, turning a
 * config mistake into what looks like an outage. `VISION_INTERNAL_URL` is
 * optional — it is the in-network shortcut, and the public URL works without it.
 */
assertRequiredEnv(['MONGODB_URI', 'VISION_SERVICE_URL', 'MCP_PUBLIC_URL']);

const PORT = process.env.PORT || 5009;

connectDb({ serviceName: 'mcp-service' })
  .then(() => {
    const server = app.listen(PORT, () =>
      logger.info('MCP service started successfully', { port: PORT })
    );

    const shutdown = (signal: string) => {
      logger.info('Shutting down mcp-service', { signal });
      server.close(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err: Error) => {
    logger.error('Failed to start mcp-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });
