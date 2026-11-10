import { pruneGuestIdentifiers } from './services/guestAdmission';
import mongoose from 'mongoose';
import { GuestRun } from './models/GuestRun';
import { ProviderUsage } from './models/ProviderUsage';
import { initializeAssistantProfileIndexes } from './services/assistantProfiles';
import { assertRequiredEnv, connectDb, fileServiceUrl, logger, serve } from '@visin/backend-core';
import { createApp } from './app';
import { Assistant } from './models/Assistant';
import { AssistantRun } from './models/AssistantRun';
import { Block } from './models/Block';
import { Budget } from './models/Budget';
import { Call } from './models/Call';
import { CallSignal } from './models/CallSignal';
import { Conversation } from './models/Conversation';
import { DeploymentSecret } from './models/DeploymentSecret';
import { ConversationAssistant } from './models/ConversationAssistant';
import { Message } from './models/Message';
import { PushSubscription } from './models/PushSubscription';
import { Settings } from './models/Settings';
import { startCallSweep } from './services/callService';
import { startWorker } from './services/worker';
assertRequiredEnv([
  'MONGODB_URI',
  'JWT_SECRET',
  'INTERNAL_SERVICE_TOKEN',
  'GROUP_SERVICE_URL',
  'AUTH_SERVICE_URL',
  'VISION_SERVICE_URL',
  'FILE_SERVICE_API_KEY'
]);
// File sharing is a standard chat feature. Fail at startup if its address is missing in production.
fileServiceUrl();
// The analyst is switched on and given a model from the page (an administrator's choice), so the
// provider key, the encryption secret and the MCP address are not required to start: the page lists
// whichever of them the server still lacks.
void connectDb({ serviceName: 'chat-service' })
  .then(async () => {
    await Promise.all([
      initializeAssistantProfileIndexes(),
      GuestRun.createIndexes(),
      ProviderUsage.init(),
      mongoose.connection.collection('chat_guest_budgets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ConversationAssistant.init(),
      Assistant.init(),
      Conversation.init(),
      Message.init(),
      AssistantRun.init(),
      Budget.init(),
      Block.init(),
      Settings.init(),
      PushSubscription.init(),
      Call.init(),
      CallSignal.init(),
      DeploymentSecret.init()
    ]);
    await pruneGuestIdentifiers();
    const guestCleanup = setInterval(() => {
      void pruneGuestIdentifiers().catch(() => logger.warn('Guest identifier cleanup failed'));
    }, 30 * 60000);
    guestCleanup.unref();
    process.once('SIGTERM', () => clearInterval(guestCleanup));
    const stop = startWorker();
    const stopSweep = startCallSweep();
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stopSweep);
    process.once('SIGINT', stopSweep);
    serve(createApp(), { port: process.env.PORT || 5012, serviceName: 'chat-service' });
  })
  .catch((error: Error) => {
    logger.error('Failed to start chat-service', { error: error.message });
    process.exit(1);
  });
