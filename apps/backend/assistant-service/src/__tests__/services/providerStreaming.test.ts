import { fetchWithTimeout } from '@visin/backend-core';
import { vi, type Mock } from 'vitest';
import { ADAPTERS } from '../../services/providers';

vi.mock('@visin/backend-core', async () => ({
  ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
  fetchWithTimeout: vi.fn()
}));

const fetchMock = fetchWithTimeout as unknown as Mock;
type Frame = [event: string | null, data: unknown];

/** A server-sent stream, cut into pieces of `size` bytes so that no event arrives conveniently whole. */
function stream(frames: Frame[], size = 7, eol = '\n'): Response {
  const text = frames
    .map(
      ([event, data]) =>
        `${event ? `event: ${event}${eol}` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}${eol}${eol}`
    )
    .join('');
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size));
        controller.close();
      }
    })
  );
}

const base = {
  apiKey: 'key',
  model: 'm',
  system: 's',
  messages: [{ role: 'user', content: 'Hi' }],
  tools: [],
  signal: new AbortController().signal
};

describe('Anthropic streaming', () => {
  const answer: Frame[] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          usage: { input_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 1 }
        }
      }
    ],
    ['ping', { type: 'ping' }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    [
      'content_block_delta',
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Validation ' } }
    ],
    [
      'content_block_delta',
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'peaked at epoch 42.' } }
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } }],
    ['message_stop', { type: 'message_stop' }]
  ];

  it('leaves out a text block that came to nothing, so the turn can be sent back with its tool results', async () => {
    fetchMock.mockResolvedValue(
      stream([
        ['message_start', { type: 'message_start', message: { usage: { input_tokens: 40, output_tokens: 1 } } }],
        // Opened and closed with nothing in it, then one with only a space: the provider refuses both on the way back.
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: ' ' } }],
        ['content_block_stop', { type: 'content_block_stop', index: 1 }],
        [
          'content_block_start',
          {
            type: 'content_block_start',
            index: 2,
            content_block: { type: 'tool_use', id: 'tool1', name: 'list_trainings', input: {} }
          }
        ],
        [
          'content_block_delta',
          {
            type: 'content_block_delta',
            index: 2,
            delta: { type: 'input_json_delta', partial_json: '{"project":"iseauto"}' }
          }
        ],
        ['content_block_stop', { type: 'content_block_stop', index: 2 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } }],
        ['message_stop', { type: 'message_stop' }]
      ])
    );

    const turn = await ADAPTERS.anthropic.send({ ...base, onText: () => undefined });

    expect(turn.calls).toEqual([{ id: 'tool1', name: 'list_trainings', input: { project: 'iseauto' } }]);
    expect(turn.assistant).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool1', name: 'list_trainings', input: { project: 'iseauto' } }]
    });
  });

  it('tells the text as it arrives, and returns the turn the whole answer would have', async () => {
    fetchMock.mockResolvedValue(stream(answer));
    const seen: string[] = [];
    const turn = await ADAPTERS.anthropic.send({ ...base, onText: (text) => seen.push(text) });
    expect(seen).toEqual(['Validation ', 'Validation peaked at epoch 42.']);
    expect(turn).toMatchObject({
      text: 'Validation peaked at epoch 42.',
      calls: [],
      stop: 'done',
      inputTokens: 55,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      outputTokens: 12
    });
    expect(turn.assistant).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Validation peaked at epoch 42.' }]
    });

    // The same answer, not streamed.
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Validation peaked at epoch 42.' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 40, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 12 }
        })
      )
    );
    expect(await ADAPTERS.anthropic.send(base)).toEqual(turn);
  });

  it('asks for a stream only when someone is watching, and is not held to the headers deadline then', async () => {
    fetchMock.mockResolvedValue(stream(answer));
    await ADAPTERS.anthropic.send({ ...base, onText: () => undefined });
    let [, init] = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(init.body).stream).toBe(true);
    expect(init.streamBody).toBe(true);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } })
      )
    );
    await ADAPTERS.anthropic.send(base);
    [, init] = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(init.body).stream).toBeUndefined();
    expect(init.streamBody).toBe(false);
  });

  it('survives windows line endings and an unnamed event', async () => {
    fetchMock.mockResolvedValue(stream(answer, 5, '\r\n'));
    expect((await ADAPTERS.anthropic.send({ ...base, onText: () => undefined })).text).toBe(
      'Validation peaked at epoch 42.'
    );
  });

  it('assembles a tool call from pieces of its JSON, and says only the text', async () => {
    fetchMock.mockResolvedValue(
      stream([
        ['message_start', { type: 'message_start', message: { usage: { input_tokens: 30, output_tokens: 1 } } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        [
          'content_block_delta',
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me look.' } }
        ],
        [
          'content_block_start',
          {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id: 't1', name: 'get_project', input: {} }
          }
        ],
        [
          'content_block_delta',
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"project":' } }
        ],
        [
          'content_block_delta',
          { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"abc"}' } }
        ],
        ['content_block_stop', { type: 'content_block_stop', index: 1 }],
        [
          'content_block_start',
          {
            type: 'content_block_start',
            index: 2,
            content_block: { type: 'tool_use', id: 't2', name: 'list_projects', input: {} }
          }
        ],
        ['content_block_stop', { type: 'content_block_stop', index: 2 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } }]
      ])
    );
    const seen: string[] = [];
    const turn = await ADAPTERS.anthropic.send({ ...base, onText: (text) => seen.push(text) });
    expect(seen).toEqual(['Let me look.']);
    expect(turn.calls).toEqual([
      { id: 't1', name: 'get_project', input: { project: 'abc' } },
      { id: 't2', name: 'list_projects', input: {} }
    ]);
    expect(turn.text).toBe('Let me look.');
  });

  it('maps the reasons a turn stops', async () => {
    const stopped = (reason: string): Frame[] => [
      ['message_start', { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 1 } } }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 2 } }]
    ];
    for (const [reason, stop] of [
      ['max_tokens', 'length'],
      ['refusal', 'refused'],
      ['end_turn', 'done']
    ] as const) {
      fetchMock.mockResolvedValue(stream(stopped(reason)));
      expect((await ADAPTERS.anthropic.send({ ...base, onText: () => undefined })).stop).toBe(stop);
    }
  });

  it('fails, without repeating the provider’s words, on an error, on garbage, and without usage', async () => {
    fetchMock.mockResolvedValue(stream([['error', { type: 'error', error: { message: 'sk-secret-key leaked' } }]]));
    const failure = await ADAPTERS.anthropic.send({ ...base, onText: () => undefined }).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain('sk-secret');

    fetchMock.mockResolvedValue(stream([['message_start', 'not json']]));
    await expect(ADAPTERS.anthropic.send({ ...base, onText: () => undefined })).rejects.toThrow('unreadable');

    fetchMock.mockResolvedValue(
      stream([['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]])
    );
    await expect(ADAPTERS.anthropic.send({ ...base, onText: () => undefined })).rejects.toThrow('token usage');
  });

  it('reports an unavailable provider by status, streaming or not', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"overloaded sk-x"}', { status: 529 }));
    await expect(ADAPTERS.anthropic.send({ ...base, onText: () => undefined })).rejects.toThrow('unavailable (529)');
  });

  it('gives up on a stream that goes quiet', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(new Response(new ReadableStream({ start: () => undefined })));
      const pending = ADAPTERS.anthropic.send({ ...base, onText: () => undefined });
      const settled = pending.catch((error: Error) => error);
      await vi.advanceTimersByTimeAsync(60_001);
      expect(((await settled) as Error).message).toContain('stopped responding');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails on a response with no body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: null });
    await expect(ADAPTERS.anthropic.send({ ...base, onText: () => undefined })).rejects.toThrow('no answer');
  });
});

describe('OpenAI streaming', () => {
  const chunk = (delta: object, finish: string | null = null) => ({ choices: [{ delta, finish_reason: finish }] });
  const usage = {
    choices: [],
    usage: { prompt_tokens: 50, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 4 } }
  };

  it('tells the text as it arrives, and returns the turn the whole answer would have', async () => {
    fetchMock.mockResolvedValue(
      stream([
        [null, chunk({ role: 'assistant', content: '' })],
        [null, chunk({ content: 'Peak at ' })],
        [null, chunk({ content: 'epoch 42.' })],
        [null, chunk({}, 'stop')],
        [null, usage],
        [null, '[DONE]']
      ])
    );
    const seen: string[] = [];
    const turn = await ADAPTERS.openai.send({ ...base, onText: (text) => seen.push(text) });
    expect(seen).toEqual(['Peak at ', 'Peak at epoch 42.']);
    expect(turn).toMatchObject({
      text: 'Peak at epoch 42.',
      calls: [],
      stop: 'done',
      inputTokens: 50,
      cacheReadTokens: 4,
      outputTokens: 9
    });

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: 'Peak at epoch 42.' } }],
          usage: { prompt_tokens: 50, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 4 } }
        })
      )
    );
    expect(await ADAPTERS.openai.send(base)).toEqual(turn);
  });

  it('asks for usage with the stream, since a streamed answer without it would cost nothing', async () => {
    fetchMock.mockResolvedValue(
      stream([
        [null, chunk({ content: 'x' }, 'stop')],
        [null, usage],
        [null, '[DONE]']
      ])
    );
    await ADAPTERS.openai.send({ ...base, onText: () => undefined });
    const [, init] = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(init.body)).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(init.streamBody).toBe(true);
  });

  it('assembles tool calls from the pieces of their names and arguments', async () => {
    fetchMock.mockResolvedValue(
      stream([
        [
          null,
          chunk({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'get_', arguments: '' } }] })
        ],
        [null, chunk({ tool_calls: [{ index: 0, function: { name: 'project', arguments: '{"project"' } }] })],
        [null, chunk({ tool_calls: [{ index: 0, function: { arguments: ':"abc"}' } }] })],
        [
          null,
          chunk({
            tool_calls: [{ index: 1, id: 'c2', type: 'function', function: { name: 'list_projects', arguments: '{}' } }]
          })
        ],
        [null, chunk({}, 'tool_calls')],
        [null, usage],
        [null, '[DONE]']
      ])
    );
    const turn = await ADAPTERS.openai.send({ ...base, onText: () => undefined });
    expect(turn.calls).toEqual([
      { id: 'c1', name: 'get_project', input: { project: 'abc' } },
      { id: 'c2', name: 'list_projects', input: {} }
    ]);
    expect(turn.assistant).toMatchObject({ tool_calls: [{ id: 'c1' }, { id: 'c2' }] });
  });

  it('maps a refusal, a cut-off answer and a content filter', async () => {
    fetchMock.mockResolvedValue(
      stream([
        [null, chunk({ refusal: 'No.' })],
        [null, chunk({}, 'stop')],
        [null, usage]
      ])
    );
    expect((await ADAPTERS.openai.send({ ...base, onText: () => undefined })).stop).toBe('refused');
    fetchMock.mockResolvedValue(
      stream([
        [null, chunk({ content: 'cut' }, 'length')],
        [null, usage]
      ])
    );
    expect((await ADAPTERS.openai.send({ ...base, onText: () => undefined })).stop).toBe('length');
    fetchMock.mockResolvedValue(
      stream([
        [null, chunk({}, 'content_filter')],
        [null, usage]
      ])
    );
    expect((await ADAPTERS.openai.send({ ...base, onText: () => undefined })).stop).toBe('refused');
  });

  it('fails on an error chunk, on an answer with nothing in it, and without usage', async () => {
    fetchMock.mockResolvedValue(stream([[null, { error: { message: 'sk-secret' } }]]));
    const failure = await ADAPTERS.openai.send({ ...base, onText: () => undefined }).catch((error: Error) => error);
    expect((failure as Error).message).not.toContain('sk-secret');
    fetchMock.mockResolvedValue(stream([[null, '[DONE]']]));
    await expect(ADAPTERS.openai.send({ ...base, onText: () => undefined })).rejects.toThrow();
    fetchMock.mockResolvedValue(
      stream([
        [null, chunk({ content: 'x' }, 'stop')],
        [null, '[DONE]']
      ])
    );
    await expect(ADAPTERS.openai.send({ ...base, onText: () => undefined })).rejects.toThrow('token usage');
  });
});

it('preserves streamed signed thinking blocks for the next tool-result exchange without showing them as an answer', async () => {
  fetchMock.mockResolvedValue(
    stream([
      ['message_start', { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 1 } } }],
      [
        'content_block_start',
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }
      ],
      [
        'content_block_delta',
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Diagnostic reasoning.' } }
      ],
      [
        'content_block_delta',
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'opaque-part-1' } }
      ],
      [
        'content_block_delta',
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: '-part-2' } }
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'tool1', name: 'list_trainings', input: {} }
        }
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 1 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }]
    ])
  );
  const shown = vi.fn();
  const result = await ADAPTERS.anthropic.send({ ...base, onText: shown });
  expect(result.assistant).toMatchObject({
    content: [
      { type: 'thinking', thinking: 'Diagnostic reasoning.', signature: 'opaque-part-1-part-2' },
      { type: 'tool_use', id: 'tool1' }
    ]
  });
  expect(shown).not.toHaveBeenCalled();
  expect(result.text).toBe('');
});
it('cleans blank blocks from replayed and non-streamed assistant messages', async () => {
  const content = [
    { type: 'text', text: ' ' },
    { type: 'tool_use', id: 'tool1', name: 'list_trainings', input: {} }
  ];
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ content, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'tool_use' }))
  );
  const result = await ADAPTERS.anthropic.send({
    ...base,
    messages: [
      ...base.messages,
      { role: 'assistant', content: [{ type: 'text', text: '' }] },
      { role: 'assistant', content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool1', content: 'No runs.' }] }
    ]
  });
  const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(sent.messages).toHaveLength(3);
  expect(sent.messages[1].content).toEqual([content[1]]);
  expect(result.assistant).toMatchObject({ content: [content[1]] });
});
