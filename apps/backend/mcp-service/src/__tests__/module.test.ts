import { VisinError } from '../http';
import { ShapeError } from '../schemas';
import {
  capped,
  count,
  day,
  duration,
  explain,
  fail,
  flattenConfig,
  metric,
  metricRanges,
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
  it('reads a flat results object', () => {
    expect(numericResults({ loss: 0.4, mAP: 0.8, epoch_note: 'ok' })).toEqual([
      ['loss', 0.4],
      ['mAP', 0.8]
    ]);
  });

  it('walks a nested tree, which is what real runs actually record', () => {
    // The bug this fixes: CLFTv2 records { train: { loss, ... }, val: {...} }
    // and reading only the top level reported "no metrics recorded" for every
    // epoch of every run — the curve tool returned nothing, confidently.
    const results = {
      train: { loss: 0.98, mean_iou: 0.085 },
      val: { loss: 0.65, mean_iou: 0.163 }
    };

    expect(numericResults(results)).toEqual([
      ['train.loss', 0.98],
      ['train.mean_iou', 0.085],
      ['val.loss', 0.65],
      ['val.mean_iou', 0.163]
    ]);
  });

  it('keeps the summary and drops the per-class breakdown beneath it', () => {
    // `train.loss` is what a curve is asking about; `train.vehicle.iou` is what
    // get_test_results is for. Shallowest-wins separates them without either
    // schema being known in advance.
    const results = {
      train: {
        loss: 0.07,
        mean_iou: 0.52,
        vehicle: { iou: 0.65, precision: 0.66, recall: 0.98, f1: 0.79 },
        sign: { iou: 0.12, precision: 0.14, recall: 0.4, f1: 0.2 }
      }
    };

    expect(numericResults(results).map(([path]) => path)).toEqual(['train.loss', 'train.mean_iou']);
  });

  it('ignores machine telemetry', () => {
    // Real data, wrong question: nobody reads a loss curve to find out what the
    // fans were doing.
    const results = {
      train: { loss: 0.07 },
      system_info: { cpu_percent: 44.1, memory_used_gb: 12.5 }
    };

    expect(numericResults(results).map(([path]) => path)).toEqual(['train.loss']);
  });

  it('bounds how many metrics one epoch contributes', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`metric_${String(i).padStart(2, '0')}`, i])
    );

    expect(numericResults(wide)).toHaveLength(12);
  });

  it('drops nested diagnostics that hold no numbers at all', () => {
    expect(numericResults({ loss: 0.2, ok: true, note: 'fine', tags: [1, 2] })).toEqual([
      ['loss', 0.2]
    ]);
  });

  it('answers nothing for an epoch that recorded nothing numeric', () => {
    expect(numericResults({ note: 'crashed', detail: { why: 'oom' } })).toEqual([]);
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

describe('metricRanges', () => {
  const epochs = [
    { epoch: 0, results: { train: { loss: 1.4021, mean_iou: 0.0121 } } },
    { epoch: 13, results: { train: { loss: 0.2402, mean_iou: 0.3 } } },
    { epoch: 199, results: { train: { loss: 1.0479, mean_iou: 0.4569 } } }
  ];

  it('finds both ends of each metric and the epoch each happened at', () => {
    // The measured case this exists for: a run whose loss ends at 1.0479 having
    // reached 0.2402 at epoch 13. Reported on its final epoch it looks four
    // times worse than it is.
    expect(metricRanges(epochs)).toEqual([
      { key: 'train.loss', low: 0.2402, lowEpoch: 13, high: 1.4021, highEpoch: 0 },
      { key: 'train.mean_iou', low: 0.0121, lowEpoch: 0, high: 0.4569, highEpoch: 199 }
    ]);
  });

  it('does not decide which end is the good one', () => {
    // Deliberately: a run records whatever it chose to, and inferring direction
    // from a name would be wrong on exactly the custom metrics that matter.
    const [loss] = metricRanges(epochs);

    expect(loss).not.toHaveProperty('best');
  });

  it('keeps a metric that only some epochs recorded', () => {
    const ranges = metricRanges([
      { epoch: 1, results: { loss: 0.5 } },
      { epoch: 2, results: { loss: 0.4, extra: 9 } }
    ]);

    expect(ranges.map((range) => range.key)).toEqual(['extra', 'loss']);
    expect(ranges[0]).toMatchObject({ low: 9, high: 9, lowEpoch: 2 });
  });

  it('returns nothing for a run with no epochs', () => {
    expect(metricRanges([])).toEqual([]);
  });
});

describe('flattenConfig', () => {
  it('flattens nested settings to dotted paths', () => {
    expect(flattenConfig({ model: { window: 16, backbone: 'swin' }, lr: 1e-4 })).toEqual([
      ['model.window', '16'],
      ['model.backbone', 'swin'],
      ['lr', '0.0001']
    ]);
  });

  it('renders a short list inline and summarises a long one', () => {
    expect(flattenConfig({ dims: [128, 256] })).toEqual([['dims', '[128,256]']]);
    expect(flattenConfig({ seeds: Array.from({ length: 40 }, (_, i) => i) })).toEqual([
      ['seeds', '[40 items]']
    ]);
  });

  it('keeps the names of a list of named objects and drops the rest', () => {
    // A real `train_classes` — four objects with weights, colours and dataset
    // mappings — inlined as one 320-character line, longer than a dozen actual
    // settings put together. The names answer "what did it train on"; the
    // structure around them is not what a config listing is for.
    expect(
      flattenConfig({
        train_classes: [
          { name: 'background', index: 0, weight: 0.5, color: [0, 0, 0] },
          { name: 'vehicle', index: 1, weight: 4, color: [128, 0, 128] }
        ]
      })
    ).toEqual([['train_classes', '2: background, vehicle']]);
  });

  it('drops a setting left as an empty string', () => {
    expect(flattenConfig({ model_path: '', lr: 0.1 })).toEqual([['lr', '0.1']]);
  });

  it('stops descending once it is printing state rather than settings', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };

    expect(flattenConfig(deep)).toEqual([['a.b.c.d', '{...}']]);
  });

  it('drops a setting that was left null', () => {
    expect(flattenConfig({ resume_from: null, lr: 0.1 })).toEqual([['lr', '0.1']]);
  });
});
