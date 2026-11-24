import type { Express } from 'express';
import mongoose from 'mongoose';
import { assertRequiredEnv, connectDb, fileServiceUrl, logger, serve } from '@visin/backend-core';
import { createApp, createWorkerApp } from './app';
import { AssistantLock } from './models/AssistantLock';
import { Assistant } from './models/Assistant';
import { AssistantRun } from './models/AssistantRun';
import { Budget } from './models/Budget';
import { ConversationAssistant } from './models/ConversationAssistant';
import { GuestRun } from './models/GuestRun';
import { ProviderUsage } from './models/ProviderUsage';
import { Settings } from './models/Settings';
import { initializeAssistantProfileIndexes } from './services/assistantProfiles';
import { drainMs } from './services/drain';
import { pruneGuestIdentifiers } from './services/guestAdmission';
import { startWakeBus } from './services/wakeBus';
import { startWorker } from './services/worker';

/**
 * What assistant-service is made of, and which programs are made of which parts. The programs are the entry points
 * (`index.ts`, `index.worker.ts`, `index.all.ts`), not a setting: what a process is for is the code's to say, and a
 * deployment only chooses which one to run.
 *
 * They share only the database (and Redis wake signals, an accelerator and not a dependency), so any number of each
 * may run. Chat is another service: this one reads its collections and asks it, over its internal API, for every
 * change to them.
 */
interface Program {
  serviceName: string;
  app: Express;
  /** Runs on SIGTERM, beside the server draining its open requests. */
  stop: () => Promise<unknown>;
}

async function connect(serviceName: string): Promise<void> {
  assertRequiredEnv([
    'MONGODB_URI',
    'JWT_SECRET',
    'INTERNAL_SERVICE_TOKEN',
    'GROUP_SERVICE_URL',
    'AUTH_SERVICE_URL',
    'VISION_SERVICE_URL',
    'FILE_SERVICE_API_KEY',
    'CHAT_INTERNAL_URL'
  ]);
  // Pictures an assistant is shown are read from file-service: fail at startup if its address is missing.
  fileServiceUrl();
  // The analyst is switched on and given a model from the page (an administrator's choice), so the
  // provider key, the encryption secret and the MCP address are not required to start: the page lists
  // whichever of them the server still lacks.
  await connectDb({ serviceName });
  await Promise.all([
    initializeAssistantProfileIndexes(),
    GuestRun.createIndexes(),
    ProviderUsage.init(),
    mongoose.connection.collection('chat_guest_budgets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ConversationAssistant.init(),
    Assistant.init(),
    AssistantRun.init(),
    AssistantLock.init(),
    Budget.init(),
    Settings.init()
  ]);
}

/** What only the API does: guest sessions are served by the process that takes their requests. */
async function apiParts(): Promise<Array<() => unknown>> {
  await pruneGuestIdentifiers();
  const guestCleanup = setInterval(() => {
    void pruneGuestIdentifiers().catch(() => logger.warn('Guest identifier cleanup failed'));
  }, 30 * 60000);
  guestCleanup.unref();
  return [() => clearInterval(guestCleanup)];
}

/** The HTTP API, the internal API chat calls, and the intake of guest questions. It never answers one. */
export async function apiProgram(): Promise<Program> {
  await connect('assistant-service');
  const stops = [...(await apiParts()), startWakeBus()];
  return {
    serviceName: 'assistant-service',
    app: createApp(),
    stop: () => Promise.all(stops.map((stop) => stop()))
  };
}

/**
 * Vivi's worker, signed-in and guest: claims questions, answers them, publishes the answers and does the queue's
 * housekeeping. It serves only `/health` and `/metrics`. Stopped by draining, not at once: it is the one part that
 * should be waited for.
 */
export async function workerProgram(): Promise<Program> {
  await connect('assistant-worker');
  const stopWakeBus = startWakeBus();
  const worker = startWorker();
  return {
    serviceName: 'assistant-worker',
    app: createWorkerApp(),
    stop: async () => {
      await worker.drain(drainMs());
      await stopWakeBus();
    }
  };
}

/** Both in one process: local development, and a deployment of a single container. */
export async function allProgram(): Promise<Program> {
  await connect('assistant-service');
  const stops = [...(await apiParts()), startWakeBus()];
  const worker = startWorker();
  return {
    serviceName: 'assistant-service',
    app: createApp(),
    stop: async () => {
      await worker.drain(drainMs());
      await Promise.all(stops.map((stop) => stop()));
    }
  };
}

/** Starts a program and listens, or logs why it could not and exits. */
export function run(program: () => Promise<Program>): void {
  program()
    .then(({ serviceName, app, stop }) => {
      serve(app, { port: process.env.PORT || 5018, serviceName, onShutdown: stop });
    })
    .catch((error: Error) => {
      logger.error('Failed to start assistant-service', { error: error.message });
      process.exit(1);
    });
}
