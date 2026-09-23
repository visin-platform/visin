import express from 'express';
import { serve } from '../../app/serve';

jest.mock('../../logging/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

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
});
