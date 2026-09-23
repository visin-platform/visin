import type { Express } from 'express';
import type { Server } from 'http';
import { logger } from '../logging/logger';

export interface ServeOptions {
  port: number | string;
  serviceName: string;
  /**
   * Work to finish before exiting on SIGTERM/SIGINT, e.g. closing a queue
   * worker so its in-flight job completes. Runs alongside the server draining
   * its open requests.
   */
  onShutdown?: () => Promise<unknown>;
}

/**
 * Starts listening, and on SIGTERM/SIGINT stops accepting connections, lets
 * in-flight requests finish, runs `onShutdown`, then exits. Anything still
 * running when the container's stop grace period ends is killed by Docker.
 */
export function serve(app: Express, { port, serviceName, onShutdown }: ServeOptions): Server {
  const server = app.listen(port, () => logger.info(`${serviceName} started`, { port }));

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Shutting down ${serviceName}`, { signal });
    const drained = new Promise<void>((resolve) => server.close(() => resolve()));
    Promise.all([drained, onShutdown?.()])
      .catch((err: Error) => logger.error('Shutdown error', { error: err.message }))
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
