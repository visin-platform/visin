const redisConstructor = jest.fn();
jest.mock('ioredis', () => ({ __esModule: true, default: redisConstructor }));

import { createRedisConnection, redisUrl } from '../../queue/connection';

const ORIGINAL = process.env.REDIS_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REDIS_URL = 'redis://localhost:6379';
});

afterAll(() => {
  process.env.REDIS_URL = ORIGINAL;
});

describe('redisUrl', () => {
  it('returns the configured url', () => {
    expect(redisUrl()).toBe('redis://localhost:6379');
  });

  it('throws when REDIS_URL is missing', () => {
    delete process.env.REDIS_URL;

    expect(() => redisUrl()).toThrow('REDIS_URL is not configured');
  });
});

describe('createRedisConnection', () => {
  it('disables the per-request retry cap that BullMQ workers cannot live with', () => {
    createRedisConnection();

    const [url, options] = redisConstructor.mock.calls[0];
    expect(url).toBe('redis://localhost:6379');
    // A worker parks on a blocking read that outlives ioredis' default budget.
    expect(options.maxRetriesPerRequest).toBeNull();
  });
});
