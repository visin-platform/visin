import { assertRequiredEnv, connectDb, logger, serve } from '@visin/backend-core';
import { Conversation, Message, AssistantRun, Budget, Block, Settings } from './models';
import { createApp } from './app';
import { startWorker } from './services/worker';
assertRequiredEnv([
  'MONGODB_URI',
  'JWT_SECRET',
  'INTERNAL_SERVICE_TOKEN',
  'GROUP_SERVICE_URL',
  'AUTH_SERVICE_URL',
  'VISION_SERVICE_URL'
]);
// The analyst is switched on and given a model from the page (an administrator's choice), so the
// provider key, the encryption secret and the MCP address are not required to start: the page lists
// whichever of them the server still lacks.
void connectDb({ serviceName: 'chat-service' })
  .then(async () => {
    await Promise.all([
      Conversation.init(),
      Message.init(),
      AssistantRun.init(),
      Budget.init(),
      Block.init(),
      Settings.init()
    ]);
    const stop = startWorker();
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    serve(createApp(), { port: process.env.PORT || 5012, serviceName: 'chat-service' });
  })
  .catch((error: Error) => {
    logger.error('Failed to start chat-service', { error: error.message });
    process.exit(1);
  });
