import { vi, type Mock } from 'vitest';
vi.mock('@modelcontextprotocol/sdk/client/index.js', async () => {
  const module = await (() => ({ Client: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', async () => {
  const module = await (() => ({ StreamableHTTPClientTransport: vi.fn() }))();
  return Object.assign({ default: module }, module);
});
vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    fetchWithTimeout: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { fetchWithTimeout } from '@visin/backend-core';
import { analyze } from '../services/analyst';
const call = vi.fn(),
  close = vi.fn(),
  activity = vi.fn();
const transport = { connect: vi.fn(), listTools: vi.fn(), callTool: call, close };
const provider = fetchWithTimeout as Mock;
const input = () => ({
  provider: 'anthropic' as const,
  model: 'configured-model',
  apiKey: 'provider-secret',
  token: 'private-token',
  projectId: 'p1',
  trainingIds: ['run1'],
  history: [{ role: 'user' as const, content: 'Compare peak and last' }],
  signal: new AbortController().signal,
  activity
});
const answer = (content: unknown[], stop_reason = 'end_turn') =>
  new Response(JSON.stringify({ content, stop_reason, usage: { input_tokens: 100, output_tokens: 20 } }));
beforeEach(() => {
  vi.clearAllMocks();
  provider.mockReset();
  call.mockReset();
  (Client as Mock).mockImplementation(function () {
    return transport;
  });
  call.mockResolvedValue({ content: [{ type: 'text', text: 'Measured result' }] });
  transport.listTools.mockResolvedValue({
    tools: [
      { name: 'get_training', inputSchema: { type: 'object', properties: { training: { type: 'string' } } } },
      { name: 'record_finding', inputSchema: { type: 'object' } }
    ]
  });
  process.env.MCP_INTERNAL_URL = 'http://mcp.invalid/mcp';
});
it('uses read-only tools, records evidence and rechecks source access before returning', async () => {
  provider.mockResolvedValueOnce(
    answer([{ type: 'tool_use', id: 'tool1', name: 'get_training', input: { training: 'run1' } }], 'tool_use')
  );
  provider.mockResolvedValueOnce(answer([{ type: 'text', text: 'Peak is epoch 42.' }]));
  const result = await analyze(input());
  expect(result.text).toBe('Peak is epoch 42.');
  expect(result.evidence[0].tool).toBe('get_training');
  const payload = JSON.parse(provider.mock.calls[0][1].body);
  expect(payload.tools.map((t: { name: string }) => t.name)).toEqual(['get_training']);
  expect(call.mock.calls.filter((args) => args[0].name === 'get_project')).toHaveLength(2);
  expect(result.inputTokens).toBe(200);
  expect(close).toHaveBeenCalledTimes(1);
});
it('fails closed when initial project access is lost', async () => {
  call.mockResolvedValue({ isError: true, content: [] });
  await expect(analyze(input())).rejects.toThrow('Project is no longer accessible');
  expect(provider).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});
it('refuses to publish an answer after access changes during generation', async () => {
  call.mockResolvedValueOnce({ content: [] }).mockResolvedValueOnce({ isError: true, content: [] });
  provider.mockResolvedValue(answer([{ type: 'text', text: 'Private metrics' }]));
  await expect(analyze(input())).rejects.toThrow('Project access changed');
});
it('never executes a write tool requested by the provider', async () => {
  provider.mockResolvedValue(
    answer([{ type: 'tool_use', id: 'write', name: 'record_finding', input: {} }], 'tool_use')
  );
  await expect(analyze(input())).rejects.toThrow('Tool unavailable');
  expect(call.mock.calls.some((args) => args[0].name === 'record_finding')).toBe(false);
});
it('bounds continuation rounds and marks oversized tool results as truncated', async () => {
  call.mockResolvedValue({ content: [{ type: 'text', text: 'x'.repeat(15000) }] });
  provider.mockImplementation(async function () {
    return answer([{ type: 'tool_use', id: 'loop', name: 'get_training', input: { training: 'run1' } }], 'tool_use');
  });
  await expect(analyze(input())).rejects.toThrow(/limit|too large/);
  expect(provider.mock.calls.length).toBeLessThanOrEqual(4);
  expect(provider.mock.calls[1][1].body).toContain('TRUNCATED');
});
it('does not return a truncated final answer or provider secrets in an error', async () => {
  provider.mockResolvedValue(answer([{ type: 'text', text: 'Incomplete' }], 'max_tokens'));
  await expect(analyze(input())).rejects.toThrow('output limit');
  provider.mockResolvedValue(new Response('sensitive provider diagnostics', { status: 429 }));
  await expect(analyze(input())).rejects.toThrow('Assistant provider unavailable (429)');
});
it('does not connect to experiment tools for general private chat', async () => {
  provider.mockResolvedValue(answer([{ type: 'text', text: 'General explanation.' }]));
  const args = input();
  delete (args as { projectId?: string }).projectId;
  await analyze(args);
  expect(transport.connect).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});
it('aborts without a provider request and rejects unbounded history', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(analyze({ ...input(), signal: controller.signal })).rejects.toThrow();
  await expect(analyze({ ...input(), history: [{ role: 'user', content: 'x'.repeat(30000) }] })).rejects.toThrow(
    'too large'
  );
  expect(provider).not.toHaveBeenCalled();
});
it('keeps a long thread working by dropping its oldest turns', async () => {
  provider.mockResolvedValue(answer([{ type: 'text', text: 'Fine.' }]));
  const history = [];
  for (let turn = 0; turn < 8; turn++)
    history.push(
      { role: 'user' as const, content: `Question ${turn}` },
      { role: 'assistant' as const, content: `${turn}`.repeat(4000) }
    );
  history.push({ role: 'user' as const, content: 'Latest question' });
  await analyze({ ...input(), history });
  const sent = JSON.parse(provider.mock.calls[0][1].body).messages as { role: string; content: string }[];
  expect(sent[0].role).toBe('user');
  expect(sent.at(-1)?.content).toBe('Latest question');
  expect(sent.some((m) => m.content === 'Question 0')).toBe(false);
});
it('sends tool text as text rather than re-encoded JSON', async () => {
  call.mockResolvedValue({ content: [{ type: 'text', text: '{"best":"epoch 42"}' }] });
  provider.mockResolvedValueOnce(
    answer([{ type: 'tool_use', id: 'tool1', name: 'get_training', input: { training: 'run1' } }], 'tool_use')
  );
  provider.mockResolvedValueOnce(answer([{ type: 'text', text: 'Done.' }]));
  await analyze(input());
  const toolResult = JSON.parse(provider.mock.calls[1][1].body).messages.at(-1).content[0];
  expect(toolResult.content).toBe('{"best":"epoch 42"}');
});
it('reports a refusal as a declined answer', async () => {
  provider.mockResolvedValue(answer([], 'refusal'));
  await expect(analyze(input())).rejects.toThrow('declined');
});

describe('with OpenAI', () => {
  const openai = () => ({ ...input(), provider: 'openai' as const, model: 'gpt-5.1', apiKey: 'openai-secret' });
  const completion = (
    message: Record<string, unknown>,
    finish_reason = 'stop',
    usage = { prompt_tokens: 100, completion_tokens: 20 }
  ) => new Response(JSON.stringify({ choices: [{ message, finish_reason }], usage }));
  const toolCall = (name: string, args: unknown, id = 'call_1') => ({
    id,
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }
  });

  it('asks the chat completions API with its own key, system prompt and function tools', async () => {
    provider.mockResolvedValueOnce(
      completion({ content: null, tool_calls: [toolCall('get_training', { training: 'run1' })] }, 'tool_calls')
    );
    provider.mockResolvedValueOnce(completion({ content: 'Peak is epoch 42.' }));
    call.mockResolvedValue({ content: [{ type: 'text', text: '{"best":"epoch 42"}' }] });
    const result = await analyze(openai());
    expect(result.text).toBe('Peak is epoch 42.');
    expect(result.evidence[0].tool).toBe('get_training');
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(40);

    const [url, init] = provider.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer openai-secret' });
    const first = JSON.parse(init.body);
    expect(first.model).toBe('gpt-5.1');
    expect(first.max_completion_tokens).toBe(6000);
    expect(first.messages[0]).toMatchObject({ role: 'system' });
    expect(first.messages[0].content).toContain('Project: p1');
    expect(first.messages[1]).toEqual({ role: 'user', content: 'Compare peak and last' });
    expect(first.tools).toEqual([
      expect.objectContaining({ type: 'function', function: expect.objectContaining({ name: 'get_training' }) })
    ]);
    expect(first.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(['get_training']);
    // The model's own message goes back, then one message per tool answer, as text.
    const second = JSON.parse(provider.mock.calls[1][1].body).messages;
    expect(second.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_1' }] });
    expect(second.at(-1)).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"best":"epoch 42"}' });
  });

  it('says when a tool failed, since the API has no flag for it', async () => {
    call.mockResolvedValueOnce({ content: [] }).mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'Run not found' }]
    });
    provider.mockResolvedValueOnce(
      completion({ content: null, tool_calls: [toolCall('get_training', { training: 'gone' })] }, 'tool_calls')
    );
    provider.mockResolvedValueOnce(completion({ content: 'That run is not available.' }));
    await analyze(openai());
    expect(JSON.parse(provider.mock.calls[1][1].body).messages.at(-1).content).toBe('Error: Run not found');
  });

  it('never executes a write tool the model asks for', async () => {
    provider.mockResolvedValue(
      completion({ content: null, tool_calls: [toolCall('record_finding', {})] }, 'tool_calls')
    );
    await expect(analyze(openai())).rejects.toThrow('Tool unavailable');
    expect(call.mock.calls.some((args) => args[0].name === 'record_finding')).toBe(false);
  });

  it('refuses unreadable tool arguments instead of running the tool with a guess', async () => {
    provider.mockResolvedValue(
      completion({ content: null, tool_calls: [toolCall('get_training', '{"training": ')] }, 'tool_calls')
    );
    await expect(analyze(openai())).rejects.toThrow('unreadable tool arguments');
    provider.mockResolvedValue(
      completion({ content: null, tool_calls: [toolCall('get_training', '[1,2]')] }, 'tool_calls')
    );
    await expect(analyze(openai())).rejects.toThrow('unreadable tool arguments');
  });

  it("does not return a cut-off answer, a refusal, or the provider's own diagnostics", async () => {
    provider.mockResolvedValue(completion({ content: 'Incomplete' }, 'length'));
    await expect(analyze(openai())).rejects.toThrow('output limit');
    provider.mockResolvedValue(completion({ content: null, refusal: 'I cannot help with that.' }));
    await expect(analyze(openai())).rejects.toThrow('declined');
    provider.mockResolvedValue(completion({ content: null }, 'content_filter'));
    await expect(analyze(openai())).rejects.toThrow('declined');
    provider.mockResolvedValue(completion({ content: '   ' }));
    await expect(analyze(openai())).rejects.toThrow('no answer');
    provider.mockResolvedValue(new Response('{"error":"echoes the key openai-secret"}', { status: 429 }));
    await expect(analyze(openai())).rejects.toThrow(/^Assistant provider unavailable \(429\)\. Try again later\.$/);
    provider.mockResolvedValue(new Response(JSON.stringify({ choices: [] })));
    await expect(analyze(openai())).rejects.toThrow('no answer');
  });

  it("counts a reasoning model's tokens against the reservation, and bounds the request size", async () => {
    provider.mockResolvedValue(
      completion({ content: null, tool_calls: [toolCall('get_training', { training: 'run1' })] }, 'tool_calls', {
        prompt_tokens: 100000,
        completion_tokens: 70000
      })
    );
    await expect(analyze(openai())).rejects.toThrow('token limit');
    provider.mockReset();
    call.mockResolvedValue({ content: [{ type: 'text', text: 'x'.repeat(15000) }] });
    provider.mockImplementation(async function () {
      return completion({ content: null, tool_calls: [toolCall('get_training', { training: 'run1' })] }, 'tool_calls');
    });
    await expect(analyze(openai())).rejects.toThrow(/limit|too large/);
    expect(provider.mock.calls.length).toBeLessThanOrEqual(4);
    expect(provider.mock.calls[1][1].body).toContain('TRUNCATED');
  });
});
