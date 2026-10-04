import type { Express } from 'express';
import type { Server } from 'http';
import { logger } from '../logging/logger';

/** Production default: inside the 10 seconds Docker gives a container to stop before it kills it. */
const PRODUCTION_GRACE_MS = 8000;
/** Anywhere else a person is waiting at a terminal. */
const DEVELOPMENT_GRACE_MS = 2000;

export interface ServeOptions {
  port: number | string;
  serviceName: string;
  /**
   * Work to finish before exiting on SIGTERM/SIGINT, e.g. closing a queue
   * worker so its in-flight job completes. Runs alongside the server draining
   * its open requests.
   */
  onShutdown?: () => Promise<unknown>;
  /**
   * How long in-flight requests may take to finish after a stop signal before their connections are closed.
   * Defaults to 8 seconds in production and 2 elsewhere.
   */
  graceMs?: number;
}

/**
 * Starts listening, and on SIGTERM/SIGINT stops accepting connections, lets in-flight requests finish, runs
 * `onShutdown`, then exits.
 *
 * A request that never finishes (a streaming response, a held connection, a browser tab on a keep-alive socket)
 * would keep the process up forever, so connections still open after `graceMs` are closed, and idle ones at once.
 * Sending the same signal again exits immediately, so a stuck shutdown can always be ended with a second Ctrl-C.
 * Anything still running when a container's stop grace period ends is killed by Docker.
 */
export function serve(app: Express, { port, serviceName, onShutdown, graceMs }: ServeOptions): Server {
  const server = app.listen(port, () => logger.info(`${serviceName} started`, { port }));
  const grace = graceMs ?? (process.env.NODE_ENV === 'production' ? PRODUCTION_GRACE_MS : DEVELOPMENT_GRACE_MS);

  let stopping: string | undefined;
  const shutdown = (signal: string) => {
    if (stopping) {
      if (signal === stopping) {
        logger.warn(`${serviceName} stopped without waiting: ${signal} received twice`);
        process.exit(1);
      }
      return;
    }
    stopping = signal;
    logger.info(`Shutting down ${serviceName}`, { signal });
    const drained = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();
    const deadline = setTimeout(() => {
      logger.warn(`Closing connections still open ${grace} ms after the stop signal`, { service: serviceName });
      server.closeAllConnections();
    }, grace);
    deadline.unref();
    Promise.all([drained, onShutdown?.()])
      .catch((err: Error) => logger.error('Shutdown error', { error: err.message }))
      .finally(() => {
        clearTimeout(deadline);
        process.exit(0);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
