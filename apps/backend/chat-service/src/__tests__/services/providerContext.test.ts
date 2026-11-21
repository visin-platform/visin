import { fitProviderContext, headText, tailText } from '../../services/providerContext';

it('leaves small payloads byte-for-byte unchanged', () => {
  const payload = JSON.stringify({ messages: [{ role: 'user', content: 'Current question' }] });
  expect(fitProviderContext(payload, 34000)).toBe(payload);
});

it('drops complete older turns while retaining context, the latest question and tool exchanges', () => {
  const context = { role: 'user', content: 'Verified application snapshot' };
  const question = { role: 'user', content: 'Lets check trainings' };
  const payload = JSON.stringify({
    messages: [
      context,
      { role: 'user', content: 'Older question' },
      { role: 'assistant', content: 'x'.repeat(5000) },
      question,
      {
        role: 'assistant',
        tool_calls: [{ id: 'read', function: { name: 'list_trainings', arguments: '{}' } }],
        content: null
      },
      { role: 'tool', tool_call_id: 'read', content: 'Five verified training runs' }
    ]
  });
  const result = JSON.parse(fitProviderContext(payload, 1000));
  expect(result.messages).toHaveLength(4);
  expect(result.messages[0]).toEqual(context);
  expect(result.messages[1]).toEqual(question);
  expect(result.messages[2].tool_calls[0].id).toBe(result.messages[3].tool_call_id);
});

for (const provider of ['anthropic', 'openai']) {
  it(`fits accumulated ${provider} results and preserves call IDs, errors and UTF-8 bounds`, () => {
    const messages: unknown[] = [{ role: 'user', content: 'Check the training results' }];
    for (let i = 0; i < 7; i++) {
      if (provider === 'anthropic')
        messages.push(
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: `read${i}`, name: 'get_training', input: { training: `run${i}` } }]
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: `read${i}`, content: '測定'.repeat(1000), is_error: i === 1 }]
          }
        );
      else
        messages.push(
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: `read${i}`, type: 'function', function: { name: 'get_training', arguments: '{}' } }]
          },
          { role: 'tool', tool_call_id: `read${i}`, content: '測定'.repeat(1000) }
        );
    }
    const payload = JSON.stringify({ system: 'Measurements only', tools: [{ name: 'get_training' }], messages });
    const fitted = fitProviderContext(payload, 34000);
    expect(Buffer.byteLength(fitted)).toBeLessThanOrEqual(34000);
    expect(fitted).toContain('TRUNCATED FOR CONTEXT');
    const result = JSON.parse(fitted);
    expect(result.messages).toHaveLength(messages.length);
    expect(result.messages[0]).toEqual(messages[0]);
    if (provider === 'anthropic') expect(result.messages[4].content[0].is_error).toBe(true);
    expect(result.messages.at(-1)).toEqual(messages.at(-1));
  });
}

it('compacts assistant prose without altering tool calls or protected application context', () => {
  const context = { role: 'tool', tool_call_id: 'visin_context', content: 'Verified snapshot' };
  const invocation = { type: 'tool_use', id: 'call', name: 'get_training', input: {} };
  const payload = JSON.stringify({
    messages: [
      context,
      { role: 'user', content: 'Current question' },
      { role: 'assistant', content: [{ type: 'text', text: 'x'.repeat(5000) }, invocation] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call', content: 'Measured result' }] }
    ]
  });
  const result = JSON.parse(fitProviderContext(payload, 1500));
  expect(result.messages[0]).toEqual(context);
  expect(result.messages[2].content[1]).toEqual(invocation);
  expect(result.messages[2].content[0].text).toContain('TRUNCATED FOR CONTEXT');
});

describe('signed reasoning', () => {
  // A run as the analyst sends it to Anthropic: each round the model thinks (a signed block), calls a tool, reads a
  // result. A thinking block is valid only after exactly the messages it was written after.
  const thinking = (round: number) => ({ type: 'thinking', thinking: '', signature: `sig-${round}-${'s'.repeat(200)}` });
  const run = (rounds: number, result = 'r'.repeat(4000)) => {
    const messages: { role: string; content: unknown }[] = [
      { role: 'user', content: 'Read the application context for the next question.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'visin_context', name: 'get_screen_context', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'visin_context', content: '{}', is_error: false }] },
      { role: 'user', content: 'An earlier question' },
      { role: 'assistant', content: 'An earlier answer' },
      { role: 'user', content: 'Do we have the paper about VLM substitution?' }
    ];
    for (let round = 0; round < rounds; round++)
      messages.push(
        {
          role: 'assistant',
          content: [
            thinking(round),
            { type: 'text', text: 'I will read the next pages.' },
            { type: 'tool_use', id: `read${round}`, name: 'read_paper_pages', input: { from: round } }
          ]
        },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: `read${round}`, content: result, is_error: false }] }
      );
    return { system: 'Rules', tools: [{ name: 'read_paper_pages' }], messages };
  };
  const signatures = (fitted: string) =>
    (JSON.parse(fitted) as { messages: { content: unknown }[] }).messages.flatMap((message, index) =>
      Array.isArray(message.content)
        ? (message.content as { type: string }[]).filter((b) => b.type === 'thinking').map(() => index)
        : []
    );

  it('sends every thinking block back as it came while nothing before it has to change', () => {
    const payload = JSON.stringify(run(3));
    expect(fitProviderContext(payload, 100_000)).toBe(payload);
  });

  it('leaves out every thinking block from the first message it changes, and none before it', () => {
    const envelope = run(4);
    const fitted = fitProviderContext(JSON.stringify(envelope), 14_000);
    expect(Buffer.byteLength(fitted)).toBeLessThanOrEqual(14_000);
    const sent = JSON.parse(fitted) as typeof envelope;
    // The older turn went first, which moves every later message: no reasoning written after it can be sent.
    expect(signatures(fitted)).toEqual([]);
    // The calls, their ids and the notes before them stay, so every result still answers its call.
    const calls = sent.messages.flatMap((m) =>
      Array.isArray(m.content) ? (m.content as { type: string; id?: string }[]).filter((b) => b.type === 'tool_use') : []
    );
    expect(calls.map((call) => call.id)).toEqual(['visin_context', 'read0', 'read1', 'read2', 'read3']);
    expect(fitted).toContain('I will read the next pages.');
  });

  it('keeps the reasoning written before the first change, whose messages are still as they were', () => {
    // No earlier turn to drop, and early results small enough to keep: only the last result is cut.
    const envelope = run(3, 'r'.repeat(200));
    (envelope.messages.at(-1)!.content as { content: string }[])[0].content = 'R'.repeat(12_000);
    envelope.messages.splice(3, 2);
    const fitted = fitProviderContext(JSON.stringify(envelope), 8_000);
    expect(fitted).toContain('TRUNCATED FOR CONTEXT');
    const last = envelope.messages.length - 1;
    // Every round's reasoning precedes the one result cut, so all of it is still valid and sent.
    expect(signatures(fitted)).toEqual([4, 6, 8]);
    expect(signatures(fitted).every((index) => index < last)).toBe(true);
  });

  it('never sends a block after a message cut differently from the round that wrote it', () => {
    // Round n is fitted and answered; round n+1 is fitted again from the whole run, so the same result is cut to
    // another length. A block written after the first cut must not follow the second one.
    const before = fitProviderContext(JSON.stringify(run(3)), 12_000);
    const after = fitProviderContext(JSON.stringify(run(4)), 12_000);
    const firstDifference = (JSON.parse(after) as { messages: unknown[] }).messages.findIndex(
      (message, index) =>
        JSON.stringify(message) !== JSON.stringify((JSON.parse(before) as { messages: unknown[] }).messages[index])
    );
    expect(firstDifference).toBeGreaterThanOrEqual(0);
    expect(signatures(after).every((index) => index < firstDifference)).toBe(true);
  });
});

it('retains an oversized current question and schemas for the caller to reject', () => {
  const payload = JSON.stringify({
    tools: ['x'.repeat(2000)],
    messages: [{ role: 'user', content: 'q'.repeat(2000) }]
  });
  expect(fitProviderContext(payload, 1000)).toBe(payload);
});

describe('cutting text', () => {
  const rocket = '🚀'; // two UTF-16 units: cutting between them leaves a half the provider cannot read

  it('never ends or starts in the middle of a character that takes two units', () => {
    expect(headText(`ab${rocket}cd`, 3)).toBe('ab');
    expect(headText(`ab${rocket}cd`, 4)).toBe(`ab${rocket}`);
    expect(headText('abcd', 2)).toBe('ab');
    expect(tailText(`ab${rocket}cd`, 3)).toBe('cd');
    expect(tailText(`ab${rocket}cd`, 4)).toBe(`${rocket}cd`);
    expect(tailText('abcd', 2)).toBe('cd');
    expect(tailText('abcd', 0)).toBe('');
  });

  it('keeps every shortened result well formed, whatever the text holds and wherever it is cut', () => {
    const body = rocket.repeat(8000);
    const payload = JSON.stringify({
      messages: [
        { role: 'user', content: 'Context' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: body }] },
        { role: 'user', content: 'Question' }
      ]
    });
    for (const limit of [20000, 19001, 15003, 12007]) {
      const fitted = fitProviderContext(payload, limit);
      // A lone surrogate is written as an escape: none may be left in what is sent.
      expect(fitted).not.toMatch(/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i);
      expect(fitted).not.toMatch(/(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}/i);
    }
  });
});
