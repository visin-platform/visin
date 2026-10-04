import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { serve } from '../../app/serve';

jest.mock('../../logging/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe('serve', () => {
  let handlers: Record<string, () => void>;
  let exit: jest.SpyInstance;

  beforeEach(() => {
    handlers = {};
    jest.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
      handlers[event] = handler;
      return process;
    }) as never);
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const exited = () => new Promise<void>((resolve) => exit.mockImplementation((() => resolve()) as never));

  it('drains the server and runs onShutdown before exiting on SIGTERM, once', async () => {
    const onShutdown = jest.fn().mockResolvedValue(undefined);
    const server = serve(express(), { port: 0, serviceName: 'test-service', onShutdown });
    await new Promise((resolve) => server.once('listening', resolve));

    const done = exited();
    handlers.SIGTERM();
    handlers.SIGINT();
    await done;

    expect(onShutdown).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('still exits when onShutdown fails', async () => {
    const server = serve(express(), {
      port: 0,
      serviceName: 'test-service',
      onShutdown: () => Promise.reject(new Error('queue would not close'))
    });
    await new Promise((resolve) => server.once('listening', resolve));

    const done = exited();
    handlers.SIGINT();
    await done;

    expect(exit).toHaveBeenCalledWith(0);
  });

  describe('a request that never finishes', () => {
    /** A streaming response that is never ended, like a held connection from a browser tab. */
    const hold = async (graceMs?: number) => {
      const app = express();
      app.get('/stream', (_req, res) => {
        res.write('hello\n');
      });
      const server = serve(app, { port: 0, serviceName: 'test-service', graceMs });
      await new Promise((resolve) => server.once('listening', resolve));
      const closed = new Promise<void>((resolve) => {
        const request = http.get({ port: (server.address() as AddressInfo).port, path: '/stream' }, (response) => {
          response.on('data', () => undefined);
          response.on('close', resolve);
          response.on('error', () => undefined);
        });
        request.on('error', () => resolve());
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { server, closed };
    };

    it('does not keep the process up: its connection is closed after the grace period and the process exits', async () => {
      const { server, closed } = await hold(100);
      const done = exited();
      const started = Date.now();
      handlers.SIGINT();
      await done;

      expect(Date.now() - started).toBeGreaterThanOrEqual(90);
      expect(exit).toHaveBeenCalledWith(0);
      expect(server.listening).toBe(false);
      await closed;
    });

    it('exits at once when the same signal arrives a second time', async () => {
      const { server, closed } = await hold(60_000);
      handlers.SIGINT();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(exit).not.toHaveBeenCalled();

      const done = exited();
      handlers.SIGINT();
      await done;
      expect(exit).toHaveBeenCalledWith(1);

      server.closeAllConnections();
      await closed;
    });

    it('does not take a different signal for a second press', async () => {
      const { server, closed } = await hold(60_000);
      handlers.SIGTERM();
      handlers.SIGINT();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(exit).not.toHaveBeenCalled();

      server.closeAllConnections();
      await closed;
    });
  });

  describe('the default grace period', () => {
    const previous = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = previous;
    });

    it.each([
      ['production', 8000],
      ['development', 2000]
    ])('is %s: %d ms', async (environment, expected) => {
      process.env.NODE_ENV = environment;
      const server = serve(express(), { port: 0, serviceName: 'test-service' });
      await new Promise((resolve) => server.once('listening', resolve));
      const delays = jest.spyOn(global, 'setTimeout');
      const done = exited();
      handlers.SIGTERM();
      await done;
      expect(delays.mock.calls.map(([, delay]) => delay)).toContain(expected);
    });
  });
});
