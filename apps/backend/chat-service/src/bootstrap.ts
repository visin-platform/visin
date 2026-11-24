import { assertRequiredEnv, connectDb, fileServiceUrl, logger, serve } from '@visin/backend-core';
import { createApp } from './app';
import { Block } from './models/Block';
import { Call } from './models/Call';
import { CallSignal } from './models/CallSignal';
import { Conversation } from './models/Conversation';
import { DeploymentSecret } from './models/DeploymentSecret';
import { Message } from './models/Message';
import { PushSubscription } from './models/PushSubscription';
import { startCallSweep } from './services/callService';
import { startMembershipRecovery } from './services/membershipAudit';
import { startWakeBus } from './services/wakeBus';

/**
 * Starts chat-service: its database, its housekeeping, and its HTTP API. The assistants are their own service
 * (assistant-service), which chat asks over its internal API and which asks chat the same way; they share only the
 * database (and Redis wake signals, an accelerator and not a dependency), so any number of each may run.
 */
async function start(): Promise<void> {
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
  // Where the assistants are is read when a question needs them, so chat starts, and people can talk to each other,
  // whether or not the assistant service is up.
  await connectDb({ serviceName: 'chat-service' });
  await Promise.all([
    Conversation.init(),
    Message.init(),
    Block.init(),
    PushSubscription.init(),
    Call.init(),
    CallSignal.init(),
    DeploymentSecret.init()
  ]);
  const stops = [startCallSweep(), startMembershipRecovery(), startWakeBus()];
  serve(createApp(), {
    port: process.env.PORT || 5012,
    serviceName: 'chat-service',
    onShutdown: () => Promise.all(stops.map((stop) => stop()))
  });
}

start().catch((error: Error) => {
  logger.error('Failed to start chat-service', { error: error.message });
  process.exit(1);
});
