import { assertRequiredEnv, connectDb, logger, serve } from '@visin/backend-core';
import app from './app';

/**
 * MongoDB is needed for one thing only: verifying the API key a request arrives
 * with. Every read and write goes over HTTP to vision-service and dataset-service, so this process
 * holds no domain data of its own — which is also why it needs neither
 * `JWT_SECRET` nor `API_KEY_ENCRYPTION_SECRET`. It never mints a credential and
 * never reads the encrypted copy of one; the digest is enough to check a key.
 *
 * `VISION_SERVICE_URL` and `DATASET_SERVICE_URL` are asserted rather than left to
 * fail lazily: without them the service boots healthy and then fails every tool
 * call, turning a config mistake into what looks like an outage. The
 * `*_INTERNAL_URL` pair is optional — the in-network shortcut; the public URLs work without it.
 *
 * `MCP_PUBLIC_URL` and `AUTH_SERVICE_URL` are what a connecting client is told
 * to authenticate against. They name this deployment's own servers, so neither
 * has a default to fall back on.
 */
assertRequiredEnv(['MONGODB_URI', 'JWT_SECRET', 'VISION_SERVICE_URL', 'DATASET_SERVICE_URL', 'MCP_PUBLIC_URL', 'AUTH_SERVICE_URL']);

const PORT = process.env.PORT || 5009;

connectDb({ serviceName: 'mcp-service' })
  .then(() => {
    serve(app, { port: PORT, serviceName: 'mcp-service' });
  })
  .catch((err: Error) => {
    logger.error('Failed to start mcp-service', { error: err.message, stack: err.stack });
    process.exit(1);
  });
