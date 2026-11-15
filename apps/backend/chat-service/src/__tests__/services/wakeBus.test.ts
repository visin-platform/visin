import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { instances, FakeRedis, warn } = vi.hoisted(() => {
  const instances: FakeRedisShape[] = [];
  interface FakeRedisShape extends EventEmitter {
    url: string;
    options: Record<string, unknown>;
    published: string[];
    subscribed: string[];
    failSubscribe: boolean;
    quit: ReturnType<typeof vi.fn>;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: Emitter } = require('events') as typeof import('events');
  class FakeRedis extends Emitter {
    published: string[] = [];
    subscribed: string[] = [];
    failSubscribe = false;
    quit = vi.fn().mockResolvedValue('OK');
    constructor(
      readonly url: string,
      readonly options: Record<string, unknown>
    ) {
      super();
      instances.push(this as unknown as FakeRedisShape);
    }
    publish(_channel: string, message: string) {
      this.published.push(message);
      return Promise.resolve(1);
    }
    subscribe(channel: string) {
      if (this.failSubscribe) return Promise.reject(new Error('no'));
      this.subscribed.push(channel);
      return Promise.resolve(1);
    }
  }
  return { instances, FakeRedis, warn: vi.fn() };
});
vi.mock('ioredis', () => ({ default: FakeRedis }));
vi.mock('@visin/backend-core', () => ({ logger: { warn } }));

import { listen, notify, pollDelay, reliable, startWakeBus } from '../../services/wakeBus';

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('wakeBus without Redis', () => {
  it('delivers a signal to its topic here, once per listener, until the listener is removed', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = listen('conv:1', a);
    listen('conv:2', b);
    notify('conv:1');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    notify('conv:1', 'conv:2');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    notify();
  });

  it('keeps going when a listener throws', () => {
    const after = vi.fn();
    listen('t', () => {
      throw new Error('boom');
    });
    listen('t', after);
    notify('t');
    expect(after).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('A wake listener failed', { error: 'boom' });
  });

  it('is not reliable, so callers keep their fast polling, and starting without a URL does nothing', async () => {
    const stop = startWakeBus('');
    expect(reliable()).toBe(false);
    expect(pollDelay(1000, 5000)).toBe(1000);
    await stop();
    expect(instances).toHaveLength(0);
  });
});

describe('wakeBus with Redis', () => {
  let stop: () => Promise<void>;
  beforeEach(() => {
    instances.length = 0;
    warn.mockClear();
    stop = startWakeBus('redis://example.test:6379');
  });
  afterEach(async () => {
    await stop();
  });
  const [publisherOf, subscriberOf] = [() => instances[0], () => instances[1]];

  it('publishes what it notifies, and only counts as reliable once subscribed', async () => {
    expect(publisherOf().options).toMatchObject({ enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    expect(reliable()).toBe(false);
    subscriberOf().emit('ready');
    await settle();
    expect(subscriberOf().subscribed).toEqual(['visin:chat:wake']);
    expect(reliable()).toBe(true);
    expect(pollDelay(1000, 5000)).toBe(5000);
    notify('worker', 'conv:9');
    expect(JSON.parse(publisherOf().published[0])).toMatchObject({ t: ['worker', 'conv:9'] });
    subscriberOf().emit('close');
    expect(reliable()).toBe(false);
  });

  it('delivers signals from other replicas, but not its own echo, and ignores anything malformed', async () => {
    const heard = vi.fn();
    listen('conv:7', heard);
    const own = JSON.parse((notify('conv:7'), publisherOf().published[0])) as { o: string };
    expect(heard).toHaveBeenCalledTimes(1);
    const message = (body: unknown) => subscriberOf().emit('message', 'visin:chat:wake', JSON.stringify(body));
    message({ o: own.o, t: ['conv:7'] });
    expect(heard).toHaveBeenCalledTimes(1);
    message({ o: 'another', t: ['conv:7', 5, 'x'.repeat(101)] });
    expect(heard).toHaveBeenCalledTimes(2);
    message({ o: 'another', t: 'conv:7' });
    subscriberOf().emit('message', 'visin:chat:wake', 'not json');
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('says once that Redis is unreachable and keeps going', async () => {
    subscriberOf().emit('error', new Error('refused'));
    publisherOf().emit('error', new Error('refused'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(reliable()).toBe(false);
    subscriberOf().failSubscribe = true;
    subscriberOf().emit('ready');
    await settle();
    expect(reliable()).toBe(false);
  });

  it('closes both connections when stopped', async () => {
    const [publisher, subscriber] = [publisherOf(), subscriberOf()];
    await stop();
    expect(publisher.quit).toHaveBeenCalled();
    expect(subscriber.quit).toHaveBeenCalled();
    notify('after');
    expect(publisher.published).toEqual([]);
  });
});
