import { fetchWithTimeout, logger } from '@visin/backend-core';
import { vi, type Mock } from 'vitest';
import { ADAPTERS, ProviderRequestError } from '../../services/providers';

vi.mock('@visin/backend-core', async () => ({
  ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
  fetchWithTimeout: vi.fn(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const fetchMock = fetchWithTimeout as unknown as Mock;
const warn = logger.warn as unknown as Mock;
const base = {
  apiKey: 'key',
  model: 'm',
  system: 's',
  messages: [{ role: 'user', content: 'Hi' }],
  tools: [],
  signal: new AbortController().signal
};

beforeEach(() => {
  fetchMock.mockReset();
  warn.mockReset();
});

describe.each([['anthropic'], ['openai']] as const)('a refused request to %s', (provider) => {
  it('is told to the person by its status alone, and to the operator by the provider’s own reason', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: 'invalid_request_error',
            message: 'messages.2.content.0: text content blocks must be non-empty'
          }
        }),
        { status: 400 }
      )
    );

    await expect(ADAPTERS[provider].send(base)).rejects.toThrow(
      'The assistant provider rejected the conversation format (400). Report this error to an administrator.'
    );

    expect(warn).toHaveBeenCalledWith('Assistant provider refused a request', {
      status: 400,
      type: 'invalid_request_error',
      reason: 'empty_text'
    });
  });

  it('never writes anything that looks like a key, or the whole body, to the log', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            type: 'invalid_request_error',
            message: `bad key sk-ant-abcdefghijkl1234 and Bearer abc.def.ghi ${'x'.repeat(2000)}`
          },
          echoed: 'request body'
        }),
        { status: 422 }
      )
    );
    await expect(ADAPTERS[provider].send(base)).rejects.toThrow('(422)');

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('sk-ant-abcdefghijkl1234');
    expect(logged).not.toContain('abc.def.ghi');
    expect(logged).not.toContain('echoed');
    expect(warn.mock.calls[0][1]).toEqual({ status: 422, type: 'invalid_request_error' });
  });

  it('logs only the status when the refusal has no readable body, and nothing for other failures', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 400 }));
    await expect(ADAPTERS[provider].send(base)).rejects.toThrow('(400)');
    expect(warn).toHaveBeenCalledWith('Assistant provider refused a request', { status: 400 });

    warn.mockReset();
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"overloaded"}}', { status: 529 }));
    await expect(ADAPTERS[provider].send(base)).rejects.toThrow('(529)');
    expect(warn).not.toHaveBeenCalled();
  });
});

it('keeps a safe provider reference and reason without retaining echoed request text', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { type: 'invalid_request_error', message: 'text content blocks must be non-empty; PRIVATE_ECHO' }
      }),
      { status: 400, headers: { 'request-id': 'req_diagnostic' } }
    )
  );
  let failure: unknown;
  try {
    await ADAPTERS.anthropic.send(base);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ProviderRequestError);
  expect((failure as ProviderRequestError).diagnostic).toEqual({
    status: 400,
    type: 'invalid_request_error',
    reason: 'empty_text',
    requestId: 'req_diagnostic'
  });
  expect((failure as Error).message).toContain('Reference: req_diagnostic');
  expect(JSON.stringify(failure)).not.toContain('PRIVATE_ECHO');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE_ECHO');
});
it('recognizes signed-response and tool-exchange validation failures', async () => {
  for (const [message, reason] of [
    ['Invalid signature in thinking block', 'signature'],
    ['tool_result is missing a tool_use', 'tool_exchange']
  ]) {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { type: 'invalid_request_error', message } }), {
        status: 400,
        headers: { 'request-id': 'sk-not-a-request-id' }
      })
    );
    await expect(ADAPTERS.anthropic.send(base)).rejects.toMatchObject({ diagnostic: { status: 400, reason } });
  }
});
