import mongoose from 'mongoose';
import { logger } from '../logging/logger';

export interface ConnectDbOptions {
  /** Mongo connection string. Defaults to process.env.MONGODB_URI. */
  uri?: string;
  /** Used in the log line on successful connection, e.g. 'auth-service'. */
  serviceName: string;
}

let connected = false;

export async function connectDb(options: ConnectDbOptions): Promise<void> {
  if (connected) return;
  const mongoUri = options.uri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(mongoUri);
  connected = true;

  logger.info(`[${options.serviceName}] MongoDB connected`);
}
