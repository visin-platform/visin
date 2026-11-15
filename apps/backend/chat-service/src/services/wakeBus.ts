import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { logger } from '@visin/backend-core';

/**
 * Tells waiting loops that something they poll for has probably changed, so they look at once instead of at their next
 * poll. Purely an accelerator: every loop still polls the database, which is what keeps a lost signal, a restart or a
 * second replica correct. What a signal buys is that, when it can be trusted, the poll can be slow.
 *
 * Within one process a signal is delivered directly. Across replicas it needs Redis (`REDIS_URL`): optional, and nothing
 * depends on it. Without it, or while it is down, `reliable()` is false and callers keep their fast polling.
 *
 * Topics: `worker` (a question is waiting), `conv:<id>` (a conversation changed), `user:<id>` (a call event).
 */
const CHANNEL = 'visin:chat:wake';
const MAX_TOPICS = 50;
const MAX_TOPIC_CHARS = 100;

const listeners = new Map<string, Set<() => void>>();
const origin = randomUUID();
let publisher: Redis | undefined;
let subscriber: Redis | undefined;
let subscribed = false;

export function listen(topic: string, listener: () => void): () => void {
  let set = listeners.get(topic);
  if (!set) listeners.set(topic, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(topic);
  };
}

function deliver(topic: string): void {
  for (const listener of [...(listeners.get(topic) ?? [])]) {
    try {
      listener();
    } catch (error) {
      logger.warn('A wake listener failed', { error: error instanceof Error ? error.message : 'unknown' });
    }
  }
}

/** Wakes the listeners of these topics here, and on the other replicas when Redis is connected. */
export function notify(...topics: string[]): void {
  if (!topics.length) return;
  for (const topic of topics) deliver(topic);
  publisher?.publish(CHANNEL, JSON.stringify({ o: origin, t: topics })).catch(() => undefined);
}

/** Whether signals from other replicas reach this one right now, so a slow poll loses nothing worth having. */
export const reliable = (): boolean => subscribed;

/** The delay before the next poll: the fast one unless signals can be trusted. */
export const pollDelay = (fastMs: number, slowMs: number): number => (reliable() ? slowMs : fastMs);

/** Connects to Redis when `REDIS_URL` is set. Returns what stops it. A failure to connect is logged, never thrown. */
export function startWakeBus(url = process.env.REDIS_URL): () => Promise<void> {
  if (!url) return async () => undefined;
  let complained = false;
  const quiet = (role: string) => (error: Error) => {
    if (complained) return;
    complained = true;
    logger.warn('Redis is unreachable; chat falls back to polling', { role, error: error.message });
  };
  // A publish that cannot be sent is dropped, not queued: the signal is worthless a few seconds late.
  publisher = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 1000 });
  publisher.on('error', quiet('publisher'));
  const listening = (subscriber = new Redis(url, { maxRetriesPerRequest: null }));
  listening.on('error', quiet('subscriber'));
  listening.on('ready', () => {
    complained = false;
    listening
      .subscribe(CHANNEL)
      .then(() => {
        subscribed = true;
      })
      .catch(quiet('subscriber'));
  });
  listening.on('close', () => {
    subscribed = false;
  });
  listening.on('message', (_channel: string, raw: string) => {
    try {
      const message = JSON.parse(raw) as { o?: unknown; t?: unknown };
      if (message.o === origin || !Array.isArray(message.t)) return;
      for (const topic of message.t.slice(0, MAX_TOPICS))
        if (typeof topic === 'string' && topic.length <= MAX_TOPIC_CHARS) deliver(topic);
    } catch {
      // Not one of ours.
    }
  });
  return async () => {
    subscribed = false;
    const connections = [publisher, subscriber];
    publisher = subscriber = undefined;
    await Promise.all(connections.map((connection) => connection?.quit().catch(() => undefined)));
  };
}
