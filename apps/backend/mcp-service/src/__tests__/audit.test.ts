jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  recordToolCall: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger, recordToolCall } from '@visin/backend-core';
import { auditTools } from '../audit';
import type { Caller } from '../tools/module';

const recorded = recordToolCall as unknown as jest.Mock;
const log = logger as unknown as Record<string, jest.Mock>;

const caller: Caller = {
  token: 'vsn_live_abc',
  actor: { kind: 'oauth', userId: 'u1', label: 'Claude', credentialId: 'vsn-client-abc' }
};

type Handler = () => Promise<unknown>;

/** Register one tool through the proxy and hand back the wrapped handler. */
function wrap(handler: Handler, from: Caller = caller): Handler {
  let registered: Handler = handler;
  const server = {
    registerTool: (_name: string, _config: unknown, wrapped: Handler) => {
      registered = wrapped;
    }
  } as unknown as McpServer;

  auditTools(server, from).registerTool(
    'get_training_curve',
    { title: 't', description: 'd', inputSchema: {} },
    handler as never
  );
  return registered;
}

const answer = (text: string, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: 'text', text }]
});

beforeEach(() => jest.clearAllMocks());

describe('auditTools', () => {
  it('measures a call without changing what the model gets back', async () => {
    const result = answer('x'.repeat(400));
    const wrapped = wrap(async () => result);

    await expect(wrapped()).resolves.toBe(result);
    expect(recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'mcp-service',
        userId: 'u1',
        actorKind: 'oauth',
        actorLabel: 'Claude',
        actorCredentialId: 'vsn-client-abc',
        tool: expect.objectContaining({ name: 'get_training_curve', chars: 400, tokens: 100 })
      })
    );
  });

  it('sums every content part, not just the first', async () => {
    const wrapped = wrap(async () => ({
      content: [
        { type: 'text', text: 'ab' },
        { type: 'text', text: 'cd' }
      ]
    }));

    await wrapped();

    expect(recorded.mock.calls[0][0].tool.chars).toBe(4);
  });

  it('times the handler end to end', async () => {
    const wrapped = wrap(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return answer('x');
    });

    await wrapped();

    expect(recorded.mock.calls[0][0].tool.ms).toBeGreaterThanOrEqual(15);
  });

  it('marks an error result as failed — its size is a message, not data', async () => {
    const wrapped = wrap(async () => answer('nope', true));

    await wrapped();

    expect(recorded.mock.calls[0][0].tool.failed).toBe(true);
  });

  it('leaves `failed` off a successful call rather than storing false', async () => {
    const wrapped = wrap(async () => answer('x'));

    await wrapped();

    expect(recorded.mock.calls[0][0].tool).not.toHaveProperty('failed');
  });

  it('records a thrown handler, then rethrows it unchanged', async () => {
    // How long it took and that it failed are the two things worth knowing
    // about a tool that keeps blowing up.
    const boom = new Error('socket hang up');
    const wrapped = wrap(async () => {
      throw boom;
    });

    await expect(wrapped()).rejects.toBe(boom);
    expect(recorded.mock.calls[0][0].tool).toMatchObject({ chars: 0, failed: true });
  });

  it('never lets measuring break the call it measures', async () => {
    // The worst possible bug to ship from a file whose entire job is to watch:
    // the throw would reach the model as a tool failure and it would retry the
    // expensive call it just paid for.
    recorded.mockImplementation(() => {
      throw new Error('audit exploded');
    });
    const result = answer('x');
    const wrapped = wrap(async () => result);

    await expect(wrapped()).resolves.toBe(result);
    expect(log.warn).toHaveBeenCalledWith(
      'Could not measure a tool call',
      expect.objectContaining({ error: 'audit exploded' })
    );
  });

  it('runs the call but files no row when there is no actor', async () => {
    const result = answer('x');
    const wrapped = wrap(async () => result, { token: 'vsn_live_abc' });

    await expect(wrapped()).resolves.toBe(result);
    expect(recorded).not.toHaveBeenCalled();
  });

  it('passes every other property through untouched', async () => {
    const server = { registerTool: jest.fn(), connect: jest.fn(), close: jest.fn() } as unknown as McpServer;
    const measured = auditTools(server, caller);

    expect(measured.close).toBe(server.close);
    expect(measured.connect).toBe(server.connect);
  });
});
