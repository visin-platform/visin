import { VisinError } from '../http';
import { ShapeError } from '../schemas';
import {
  capped,
  count,
  day,
  duration,
  explain,
  fail,
  metric,
  numericResults,
  ok,
  sample
} from '../tools/module';

describe('ok / fail', () => {
  it('wrap text the way an MCP tool result is shaped', () => {
    expect(ok('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(fail('nope')).toEqual({ isError: true, content: [{ type: 'text', text: 'nope' }] });
  });
});

describe('ok — the ceiling on a single result', () => {
  it('passes a normal answer through untouched', () => {
    expect(ok('a training run')).toEqual({ content: [{ type: 'text', text: 'a training run' }] });
  });

  it('truncates an answer that would crowd out the conversation', () => {
    // Measured against production: get_test_results returned 658,000 characters
    // — 164,000 tokens, a whole context window — because an endpoint ignored
    // its `limit`. That bug is fixed; this makes the class of it survivable.
    const huge = Array.from({ length: 5000 }, (_, i) => `- epoch ${i}: loss 0.1234`).join('\n');

    const text = ok(huge).content[0].text;

    expect(huge.length).toBeGreaterThan(100_000);
    expect(text.length).toBeLessThan(21_000);
  });

  it('says it truncated, and that what is left is a beginning not a summary', () => {
    // A model told nothing would report the fragment as the complete answer.
    const text = ok('x'.repeat(50_000)).content[0].text;

    expect(text).toContain('Truncated');
    expect(text).toContain('not a summary');
    expect(text).toContain('Narrow the request');
  });

  it('cuts at a line boundary, never mid-number', () => {
    // A figure cut in half is worse than a long answer: the model cannot tell a
    // truncated number from a real one, and would quote it.
    const rows = Array.from({ length: 4000 }, (_, i) => `- mAP 0.${i}00000`).join('\n');

    const [body] = ok(rows).content[0].text.split('\n\n[Truncated');

    for (const line of body.split('\n')) {
      expect(rows.split('\n')).toContain(line);
    }
  });
});

describe('explain', () => {
  it('tells the model not to retry a 403, and why', () => {
    const result = explain(new VisinError('Access denied to project', 403));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Do not retry');
    expect(result.content[0].text).toContain('scope');
  });

  it('tells the model not to retry a rejected key', () => {
    expect(explain(new VisinError('nope', 401)).content[0].text).toContain('Do not retry');
  });

  it('warns that a 404 may really be a permissions answer', () => {
    // A private project reads as "not found" to someone who cannot see it, so a
    // model that takes 404 at face value will confidently tell the user the run
    // does not exist.
    const text = explain(new VisinError('Training not found', 404)).content[0].text;

    expect(text).toContain('private');
  });

  it('passes an ordinary API failure through as its message', () => {
    expect(explain(new VisinError('Maximum 30 trainings', 400)).content[0].text).toBe(
      'Maximum 30 trainings'
    );
  });

  it('reports a changed contract as a bug rather than something to retry', () => {
    const text = explain(new ShapeError('/trainings', 'trainings: expected array')).content[0].text;

    expect(text).toContain('rather than something to retry');
    expect(text).toContain('trainings: expected array');
  });

  it('survives something that is not an Error at all', () => {
    expect(explain('a bare string').content[0].text).toBe('Unknown error');
    expect(explain(new Error('boom')).content[0].text).toBe('boom');
  });
});

describe('duration', () => {
  it.each([
    [0, '0s'],
    [-5, '0s'],
    [NaN, '0s'],
    [45, '45s'],
    [90, '1m 30s'],
    [3600, '1h'],
    [3660, '1h 1m'],
    [33_000, '9h 10m']
  ])('renders %ss as %s', (seconds, expected) => {
    expect(duration(seconds)).toBe(expected);
  });
});

describe('metric', () => {
  it('keeps an integer intact and trims a float to something readable', () => {
    expect(metric(12)).toBe('12');
    expect(metric(0.123456789)).toBe('0.1235');
    // Trailing zeros are dropped: "0.5000" invites a claim of precision the
    // number never had.
    expect(metric(0.5)).toBe('0.5');
  });
});

describe('count', () => {
  it('separates thousands, so a figure is read rather than decoded', () => {
    expect(count(7484)).toBe('7,484');
    expect(count(12)).toBe('12');
  });
});

describe('day', () => {
  it('drops the time, which is never the part anyone asked about', () => {
    expect(day('2026-09-01T12:34:56.000Z')).toBe('2026-09-01');
    expect(day(undefined)).toBe('unknown');
  });
});

describe('numericResults', () => {
  it('keeps the numbers, in a stable order', () => {
    expect(numericResults({ loss: 0.4, mAP: 0.8, epoch_note: 'ok' })).toEqual([
      ['loss', 0.4],
      ['mAP', 0.8]
    ]);
  });

  it('drops nested diagnostics rather than rendering them', () => {
    // These cost far more than they explain, and every one is re-sent on every
    // later turn of the conversation.
    expect(numericResults({ per_class: { car: 1 }, loss: 0.2, ok: true })).toEqual([['loss', 0.2]]);
  });
});

describe('sample', () => {
  it('returns everything when there is less than asked for', () => {
    expect(sample([1, 2, 3], 12)).toEqual([1, 2, 3]);
  });

  it('always keeps the first and last', () => {
    const epochs = Array.from({ length: 300 }, (_, i) => i);
    const picked = sample(epochs, 12);

    expect(picked).toHaveLength(12);
    expect(picked[0]).toBe(0);
    expect(picked[picked.length - 1]).toBe(299);
  });

  it('spaces the rest evenly', () => {
    expect(sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('never returns more points than there are epochs', () => {
    expect(sample([1, 2], 12)).toEqual([1, 2]);
    expect(sample([], 12)).toEqual([]);
  });
});

describe('capped', () => {
  it('passes a short list through untouched', () => {
    expect(capped([1, 2], 10, 'things')).toEqual({ shown: [1, 2], note: '' });
  });

  it('says what it left out rather than truncating in silence', () => {
    const { shown, note } = capped(Array.from({ length: 120 }, (_, i) => i), 50, 'projects');

    expect(shown).toHaveLength(50);
    expect(note).toContain('first 50 of 120 projects');
  });
});
