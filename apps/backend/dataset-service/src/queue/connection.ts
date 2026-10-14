import Redis, { RedisOptions } from 'ioredis';
import { QUEUE_TIMEOUT_MS } from './constants';

/**
 * Redis connections for BullMQ.
 *
 * `maxRetriesPerRequest: null` is mandatory for a BullMQ worker: the blocking
 * `BZPOPMIN` a worker parks on outlives ioredis' default request retry budget,
 * and ioredis would otherwise error the command out from under the worker.
 */
const OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
};

export const redisUrl = (): string => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }
  return url;
};

export const createRedisConnection = (role: 'worker' | 'producer' = 'worker'): Redis => new Redis(redisUrl(), {
  ...OPTIONS,
  ...(role === 'producer' ? {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: QUEUE_TIMEOUT_MS,
    commandTimeout: QUEUE_TIMEOUT_MS
  } : {})
});
