import { canonicalJson, protocolDigest } from '../../services/suiteProtocol';
import { suiteProtocolSchema, type SuiteProtocolInput } from '../../validation/suiteSchemas';

const base: SuiteProtocolInput = {
  task: 'semantic-segmentation',
  data: { kind: 'external', label: 'Road test frames', manifestSha256: 'a'.repeat(64) },
  split: 'test',
  conditions: [{ name: 'day', sampleCount: 120 }, { name: 'night', sampleCount: 100 }],
  classes: [{ id: 'vehicle' }, { id: 'pedestrian', name: 'Pedestrian' }],
  metrics: [
    { key: 'mIoU_foreground', direction: 'max', range: { min: 0, max: 1 }, headline: true },
    { key: 'mean_ap', direction: 'max' }
  ],
  aggregation: 'equal-mean-of-conditions',
  input: { sensors: ['camera', 'lidar'] },
  evaluator: { package: 'visin-fusion' }
};
const parse = (overrides: Record<string, unknown> = {}) => suiteProtocolSchema.parse({ ...base, ...overrides });
const digest = (overrides: Record<string, unknown> = {}) => protocolDigest(parse(overrides));
/** The attributes scoring groups samples by; every sample suite declares them. */
const SCORED = [{ key: 'class' }, { key: 'size' }];

describe('canonicalJson', () => {
  it('spells equal values the same whatever the key order, and leaves out undefined', () => {
    expect(canonicalJson({ b: [1, { d: 1, c: 2 }], a: undefined })).toBe('{"b":[1,{"c":2,"d":1}]}');
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('protocolDigest', () => {
  it('does not change existing protocols when the optional sample blocks are absent', () => {
    expect(digest()).toBe('fe94ccb914e49cca58b53d3282fa962398d8448781f95443b1dd5f3cd3428473');
    expect(digest({ samples: undefined, reference: undefined, settings: undefined })).toBe(digest());
    expect(parse()).not.toHaveProperty('samples');
    expect(parse()).not.toHaveProperty('reference');
    expect(parse()).not.toHaveProperty('settings');
  });

  it('includes sample protocol, reference and settings in the digest', () => {
    const samples = { attrs: [...SCORED, { key: 'pixels' }], fields: [{ key: 'verdict', values: ['valid', 'unclear'], abstain: 'unclear' }], weight: 'pixels' };
    expect(digest({ samples })).not.toBe(digest());
    expect(digest({ reference: { samplesDigest: 'b'.repeat(64) } })).not.toBe(digest());
    expect(digest({ settings: { prompt: 'judge' } })).not.toBe(digest());
  });
  it('is a SHA-256 and the same for the same protocol', () => {
    expect(digest()).toMatch(/^[0-9a-f]{64}$/);
    expect(digest()).toBe(digest());
  });

  it('does not depend on the order of conditions, classes, metrics or sensors, or on spelled-out defaults', () => {
    const reordered = digest({
      conditions: [...(base.conditions as object[])].reverse(),
      classes: [...(base.classes as object[])].reverse(),
      metrics: [...(base.metrics as object[])].reverse(),
      input: { sensors: ['lidar', 'camera'] },
      ignoredClasses: []
    });
    expect(reordered).toBe(digest());
  });

  it.each<[string, Record<string, unknown>]>([
    ['a sample count', { conditions: [{ name: 'day', sampleCount: 121 }, { name: 'night', sampleCount: 100 }] }],
    ['a condition', { conditions: [{ name: 'day', sampleCount: 120 }] }],
    ['the dataset digest', { data: { kind: 'external', label: 'Road test frames', manifestSha256: 'b'.repeat(64) } }],
    ['the split', { split: 'val' }],
    ['the aggregation', { aggregation: 'sample-weighted-mean' }],
    ['a metric direction', { metrics: [{ key: 'mIoU_foreground', direction: 'min', range: { min: 0, max: 1 }, headline: true }, { key: 'mean_ap', direction: 'max' }] }],
    ['the headline', { metrics: [{ key: 'mIoU_foreground', direction: 'max', range: { min: 0, max: 1 } }, { key: 'mean_ap', direction: 'max', headline: true }] }],
    ['a metric range', { metrics: [{ key: 'mIoU_foreground', direction: 'max', range: { min: 0, max: 100 }, headline: true }, { key: 'mean_ap', direction: 'max' }] }],
    ['the sensors', { input: { sensors: ['camera'] } }],
    ['an ignored class', { ignoredClasses: ['void'] }],
    ['the evaluator', { evaluator: { package: 'visin-fusion', minVersion: '2.0.0' } }]
  ])('changes with %s', (_name, change) => {
    expect(digest(change)).not.toBe(digest());
  });
});

describe('suiteProtocolSchema', () => {
  it('pins metric filters to declared categorical sample attributes', () => {
    const sample = { samples: { attrs: [...SCORED, { key: 'role', values: ['classify', 'confirm'] }], fields: [{ key: 'outcome', values: ['keep', 'delete'] }] } };
    const metrics = [{ key: 'reject', direction: 'min', headline: true, derivation: 'share:outcome=delete', filter: { role: 'classify' } }];
    expect(parse({ ...sample, metrics }).metrics[0].filter).toEqual({ role: 'classify' });
    expect(digest({ ...sample, metrics })).not.toBe(digest({ ...sample, metrics: [{ ...metrics[0], filter: { role: 'confirm' } }] }));
    expect(suiteProtocolSchema.safeParse({ ...base, ...sample, metrics: [{ ...metrics[0], filter: { role: 'typo' } }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...sample, metrics: [{ ...metrics[0], filter: { missing: 'classify' } }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...sample, metrics: [{ ...metrics[0], derivation: undefined }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...sample, metrics: [{ ...metrics[0], missingValue: 'delete' }] }).success).toBe(false);
    const referenced = { ...sample, reference: { samplesDigest: 'b'.repeat(64) }, samples: { ...sample.samples, fields: [{ key: 'outcome', values: ['keep', 'delete'], accept: ['keep'] }] } };
    expect(parse({ ...referenced, metrics: [{ ...metrics[0], derivation: 'fa:outcome', missingValue: 'delete' }] }).metrics[0].missingValue).toBe('delete');
    expect(suiteProtocolSchema.safeParse({ ...base, ...referenced, metrics: [{ ...metrics[0], derivation: 'fa:outcome', missingValue: 'typo' }] }).success).toBe(false);
  });
  it('accepts only declared sample derivations and pins them in the digest', () => {
    const samples = { attrs: SCORED, fields: [{ key: 'outcome', values: ['keep', 'delete'], accept: ['keep'] }] };
    const metrics = [
      { key: 'reject', direction: 'min', headline: true, derivation: 'share:outcome=delete' },
      { key: 'error', direction: 'min', derivation: 'error:outcome' },
      { key: 'false_accept', direction: 'min', derivation: 'fa:outcome' },
      { key: 'false_reject', direction: 'min', derivation: 'fr:outcome' },
      { key: 'latency', direction: 'min', derivation: 'latency:mean' }
    ];
    const protocol = { samples, metrics, reference: { samplesDigest: 'b'.repeat(64) } };
    expect(parse(protocol).metrics).toHaveLength(5);
    expect(digest(protocol)).not.toBe(digest({ ...protocol, metrics: [{ ...metrics[0], derivation: 'share:outcome=keep' }, ...metrics.slice(1)] }));
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, reference: undefined }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, samples: undefined }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, metrics: [{ ...metrics[0], derivation: 'share:outcome=typo' }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, metrics: [{ ...metrics[0], derivation: 'error:missing' }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, metrics: [{ ...metrics[0], derivation: 'median:latency' }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, samples: { ...samples, fields: [{ key: 'outcome', values: ['keep', 'delete'] }] }, metrics: [{ ...metrics[0], derivation: 'fa:outcome' }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, classes: [{ id: 'overall' }] }).success).toBe(false);
    expect(suiteProtocolSchema.safeParse({ ...base, ...protocol, samples: { attrs: SCORED, fields: [{ key: 'outcome', values: ['keep', 'delete'], accept: ['keep', 'delete'] }] } }).success).toBe(false);
  });
  it('lower-cases digests and commits so one spelling is stored', () => {
    const parsed = parse({ data: { kind: 'external', label: 'x', manifestSha256: 'A'.repeat(64) } });
    expect(parsed.data).toMatchObject({ manifestSha256: 'a'.repeat(64) });
    const hf = parse({ data: { kind: 'hf', repo: 'acme/frames', commit: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01' } });
    expect(hf.data).toMatchObject({ commit: 'abcdef0123456789abcdef0123456789abcdef01' });
  });

  it.each<[string, Record<string, unknown>]>([
    ['a branch instead of a commit', { data: { kind: 'hf', repo: 'acme/frames', commit: 'main' } }],
    ['a short manifest digest', { data: { kind: 'external', label: 'x', manifestSha256: 'abc' } }],
    ['a Visin dataset without its archive digest', { data: { kind: 'visin', datasetId: 'd1' } }],
    ['duplicate condition names', { conditions: [{ name: 'day', sampleCount: 1 }, { name: 'day', sampleCount: 2 }] }],
    ['a condition called overall', { conditions: [{ name: 'overall', sampleCount: 1 }] }],
    ['no conditions', { conditions: [] }],
    ['a zero sample count', { conditions: [{ name: 'day', sampleCount: 0 }] }],
    ['duplicate class ids', { classes: [{ id: 'a' }, { id: 'a' }] }],
    ['duplicate metric keys', { metrics: [{ key: 'm', direction: 'max', headline: true }, { key: 'm', direction: 'min' }] }],
    ['no headline', { metrics: [{ key: 'm', direction: 'max' }] }],
    ['two headlines', { metrics: [{ key: 'm', direction: 'max', headline: true }, { key: 'n', direction: 'max', headline: true }] }],
    ['an inverted range', { metrics: [{ key: 'm', direction: 'max', headline: true, range: { min: 1, max: 0 } }] }],
    ['an unknown aggregation', { aggregation: 'median' }],
    ['duplicate attribute values', { samples: { attrs: [...SCORED, { key: 'role', values: ['classify', 'classify'] }], fields: [{ key: 'verdict', values: ['valid'] }] } }],
    ['duplicate attribute keys', { samples: { attrs: [...SCORED, { key: 'role', values: ['classify'] }, { key: 'role', values: ['confirm'] }], fields: [{ key: 'verdict', values: ['valid'] }] } }],
    ['duplicate field keys', { samples: { attrs: SCORED, fields: [{ key: 'verdict', values: ['valid'] }, { key: 'verdict', values: ['invalid'] }] } }],
    ['a weight that is not an attribute', { samples: { attrs: SCORED, fields: [{ key: 'verdict', values: ['valid'] }], weight: 'pixels' } }],
    ['a categorical weight', { samples: { attrs: [...SCORED, { key: 'pixels', values: ['small'] }], fields: [{ key: 'verdict', values: ['valid'] }], weight: 'pixels' } }],
    ['an unknown abstain value', { samples: { attrs: SCORED, fields: [{ key: 'verdict', values: ['valid'], abstain: 'unclear' }] } }],
    ['a sample suite without the class attribute', { samples: { attrs: [{ key: 'size' }], fields: [{ key: 'verdict', values: ['valid'] }] } }],
    ['a sample suite without the size attribute', { samples: { attrs: [{ key: 'class' }], fields: [{ key: 'verdict', values: ['valid'] }] } }],
    ['a class value that is not a class', { samples: { attrs: [{ key: 'class', values: ['vehicle', 'tram'] }, { key: 'size' }], fields: [{ key: 'verdict', values: ['valid'] }] } }],
    ['a size value that is not a condition', { samples: { attrs: [{ key: 'class' }, { key: 'size', values: ['day', 'dusk'] }], fields: [{ key: 'verdict', values: ['valid'] }] } }],
    ['an invalid reference digest', { reference: { samplesDigest: 'bad' } }],
    ['a field the digest would not cover', { notes: 'x' }]
  ])('refuses %s', (_name, change) => {
    expect(suiteProtocolSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
});
