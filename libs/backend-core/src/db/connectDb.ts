import mongoose from 'mongoose';
import { logger } from '../logging/logger';

export interface ConnectDbOptions {
  /** Mongo connection string. Defaults to process.env.MONGODB_URI. */
  uri?: string;
  /** Used in the log line on successful connection, e.g. 'auth-service'. */
  serviceName: string;
}

let connected = false;
/**
 * Set while a connection attempt is in flight so concurrent callers await that
 * attempt instead of opening a second one against the same mongoose singleton.
 */
let pending: Promise<void> | null = null;

/**
 * Connects once and throws on failure. There is deliberately no retry loop here.
 *
 * The driver already retries: `connect()` keeps doing server selection for
 * `serverSelectionTimeoutMS` (30s by default) before it rejects, which covers a
 * mongo container that is up but not yet accepting connections. Anything that
 * survives that is a real fault — wrong credentials, wrong host, a dead
 * cluster — and retrying in-process cannot fix it.
 *
 * Callers exit non-zero when this throws, which hands recovery to the container
 * restart policy (`restart: unless-stopped`) that already supervises every
 * service. That is also the only layer that still recovers from an outage
 * lasting hours, which no bounded in-process loop can sit through. One
 * supervisor, and a service that can't reach mongo shows up as a restarting
 * container instead of a healthy one serving errors.
 */
export async function connectDb(options: ConnectDbOptions): Promise<void> {
  if (connected) return;
  if (pending) return pending;

  const mongoUri = options.uri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI not set');

  pending = connectOnce(mongoUri, options.serviceName).finally(() => {
    pending = null;
  });

  return pending;
}

async function connectOnce(mongoUri: string, serviceName: string): Promise<void> {
  try {
    await mongoose.connect(mongoUri);
    connected = true;

    registerConnectionListeners(serviceName);
    logger.info(`[${serviceName}] MongoDB connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[${serviceName}] MongoDB connection failed`, { error: message });
    throw err;
  }
}

/**
 * Mongoose reconnects on its own once an initial connection has succeeded, so
 * these only report state — but without them a drop is silent and the only
 * symptom is the health endpoint flipping to "disconnected".
 */
let listenersRegistered = false;

function registerConnectionListeners(serviceName: string): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('error', (err: Error) => {
    logger.error(`[${serviceName}] MongoDB connection error`, { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    // Not fatal: the driver retries in the background. connected stays true so
    // an in-flight caller doesn't kick off a duplicate connect race.
    logger.warn(`[${serviceName}] MongoDB disconnected`);
  });

  mongoose.connection.on('reconnected', () => {
    logger.info(`[${serviceName}] MongoDB reconnected`);
  });
}
