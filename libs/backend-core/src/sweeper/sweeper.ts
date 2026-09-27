import { hostname } from 'os';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { logger } from '../logging/logger';

export interface SweeperOptions {
  /** also the lease's id, so it must be unique across services */
  name: string;
  /** the work: idempotent, so a run that is repeated or skipped does no harm */
  run: () => Promise<void>;
  /** how often; an hour by default */
  everyMs?: number;
  /** how long one run may hold the lease; defaults to `everyMs` */
  leaseMs?: number;
}

export interface Sweeper {
  /** one run now, if this process can take the lease; resolves whether it ran */
  runOnce(): Promise<boolean>;
  /** stop the schedule and wait for a run in progress: pass to `serve`'s `onShutdown` */
  stop(): Promise<void>;
}

const HOUR = 60 * 60 * 1000;

interface Lease {
  _id: string;
  holder: string;
  until: Date;
}

/**
 * Periodic work with no cron and no Redis: a timer in the service, once at
 * start and then every `everyMs`.
 *
 * Several replicas may run the same service, so each run first takes a lease
 * (a document in `sweeper_leases`) and skips when another process holds an
 * unexpired one. The lease is best-effort, which is why `run` must be
 * idempotent: a run cut off halfway is simply done again next time.
 */
export function startSweeper({ name, run, everyMs = HOUR, leaseMs = everyMs }: SweeperOptions): Sweeper {
  const holder = `${hostname()}:${process.pid}:${randomBytes(4).toString('hex')}`;
  let inFlight: Promise<boolean> | null = null;
  let stopped = false;

  const takeLease = async (): Promise<boolean> => {
    const leases = mongoose.connection.collection<Lease>('sweeper_leases');
    const now = new Date();
    try {
      const taken = await leases.findOneAndUpdate(
        { _id: name, $or: [{ until: { $lte: now } }, { holder }] },
        { $set: { holder, until: new Date(now.getTime() + leaseMs) } },
        { upsert: true, returnDocument: 'after' }
      );
      return taken?.holder === holder;
    } catch (error) {
      // Another process holds it: the upsert collided with its document.
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  };

  const attempt = async (): Promise<boolean> => {
    try {
      if (stopped || !(await takeLease())) return false;
      await run();
      return true;
    } catch (error) {
      logger.error('Sweeper run failed', { sweeper: name, error: (error as Error).message });
      return false;
    }
  };

  // One run at a time in this process; a tick that finds one running joins it.
  const runOnce = (): Promise<boolean> => {
    inFlight ??= attempt().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  void runOnce();
  const timer = setInterval(() => void runOnce(), everyMs);
  timer.unref?.();

  return {
    runOnce,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    }
  };
}
