import { BadRequestError, NotFoundError, authenticateToken } from '@visin/backend-core';
import type { RequestHandler } from 'express';
import { CallFeed } from '../services/callFeed';
import { callsEnabled } from '../services/callService';
import { onWake } from '../services/callWake';
import { deviceId } from '../validation/callSchemas';
import { parsed } from '../validation/parse';

/** How often the stream asks the database while this device has a call, and while it has none. */
const BUSY_POLL_MS = 250;
const IDLE_POLL_MS = 1000;
/** Session and access are re-checked on this schedule, as for a conversation's stream. */
const REAUTHORIZE_MS = 10_000;
/** A named heartbeat lets clients detect a silently stalled connection. */
const HEARTBEAT_MS = 20_000;
const MAX_STREAMS_PER_USER = 6;

/**
 * GET /events?device=<id>: everything for this person that is not about one conversation, which today is calls
 * (ringing, answered, ended, and the signals of the call this device is on). One stream per open tab.
 */
export function createUserStreamController(): RequestHandler {
  const streams = new Map<string, number>();
  return async (req, res) => {
    if (!callsEnabled()) throw new NotFoundError('Calls are turned off');
    const userId = req.user!.id;
    const device = parsed(deviceId, req.query.device);
    if ((streams.get(userId) || 0) >= MAX_STREAMS_PER_USER) throw new BadRequestError('Too many open chat streams');
    streams.set(userId, (streams.get(userId) || 0) + 1);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();

    const feed = new CallFeed(userId, device);
    let stopped = false;
    let loading = false;
    let again = false;
    let authorizedAt = Date.now();
    let wroteAt = 0;
    let timer: NodeJS.Timeout | undefined;

    const later = (busy: boolean) => {
      if (!stopped) timer = setTimeout(() => void tick(), busy ? BUSY_POLL_MS : IDLE_POLL_MS);
    };
    const write = (frame: string) => {
      wroteAt = Date.now();
      if (!res.write(frame)) res.end();
    };
    const tick = async (): Promise<void> => {
      if (stopped) return;
      // A wake-up that arrives mid-poll is not lost: the poll runs once more straight after.
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      clearTimeout(timer);
      let busy = false;
      try {
        if (Date.now() - authorizedAt >= REAUTHORIZE_MS) {
          // authenticateToken skips an already-authenticated request: clear the cached payload so a revoked
          // session is noticed on a connection that stays open.
          req.user = undefined;
          await new Promise<void>((resolve, reject) => {
            void authenticateToken(req, res, (error) => (error ? reject(error) : resolve()));
          });
          authorizedAt = Date.now();
        }
        const polled = await feed.poll();
        busy = polled.busy;
        for (const event of polled.events) if (!stopped) write(`event: call\ndata: ${JSON.stringify(event)}\n\n`);
        if (!stopped && Date.now() - wroteAt >= HEARTBEAT_MS) write('event: heartbeat\ndata: {}\n\n');
      } catch {
        res.end();
      } finally {
        loading = false;
        if (again) {
          again = false;
          busy = true;
        }
        later(busy);
      }
    };

    const unwatch = onWake(userId, () => void tick());
    res.on('close', () => {
      stopped = true;
      clearTimeout(timer);
      unwatch();
      const remaining = (streams.get(userId) || 1) - 1;
      if (remaining) streams.set(userId, remaining);
      else streams.delete(userId);
    });
    write('event: ready\ndata: {}\n\n');
    void tick();
  };
}
