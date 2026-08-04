import mongoose from 'mongoose';
import { logger } from '../logging/logger';

export interface ConnectDbOptions {
  /** Mongo connection string. Defaults to process.env.MONGODB_URI. */
  uri?: string;
  /** Used in the log line on successful connection, e.g. 'auth-service'. */
  serviceName: string;
  /**
   * How many times to try before giving up. Defaults to Infinity: a service that
   * boots before the host's network is up must keep trying, not die once.
   */
  maxAttempts?: number;
  /** Backoff delay for the first retry. Doubles per attempt up to maxDelayMs. */
  initialDelayMs?: number;
  /** Ceiling for the backoff delay. */
  maxDelayMs?: number;
}

const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

let connected = false;
/**
 * Set while a retry loop is running so concurrent callers await that loop
 * instead of starting a second one against the same mongoose singleton.
 */
let pending: Promise<void> | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function connectDb(options: ConnectDbOptions): Promise<void> {
  if (connected) return;
  if (pending) return pending;

  const mongoUri = options.uri || process.env.MONGODB_URI;
  // A missing URI is a config error, not a transient one — retrying can never
  // fix it, so fail immediately rather than looping forever on a typo.
  if (!mongoUri) throw new Error('MONGODB_URI not set');

  pending = connectWithRetry(mongoUri, options).finally(() => {
    pending = null;
  });

  return pending;
}

async function connectWithRetry(mongoUri: string, options: ConnectDbOptions): Promise<void> {
  const { serviceName } = options;
  const maxAttempts = options.maxAttempts ?? Infinity;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(mongoUri);
      connected = true;

      registerConnectionListeners(serviceName);
      logger.info(`[${serviceName}] MongoDB connected`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt >= maxAttempts) {
        logger.error(`[${serviceName}] MongoDB connection failed, giving up`, { attempt, error: message });
        throw err;
      }

      // Exponential backoff, capped: a Mongo outage lasting hours shouldn't
      // grow the gap past maxDelayMs and leave the service down long after
      // the database comes back.
      const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
      logger.warn(`[${serviceName}] MongoDB connection failed, retrying`, { attempt, delayMs, error: message });
      await sleep(delayMs);
    }
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
