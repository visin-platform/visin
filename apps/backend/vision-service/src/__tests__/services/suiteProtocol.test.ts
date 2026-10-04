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

describe('canonicalJson', () => {
  it('spells equal values the same whatever the key order, and leaves out undefined', () => {
    expect(canonicalJson({ b: [1, { d: 1, c: 2 }], a: undefined })).toBe('{"b":[1,{"c":2,"d":1}]}');
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('protocolDigest', () => {
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
    ['a field the digest would not cover', { notes: 'x' }]
  ])('refuses %s', (_name, change) => {
    expect(suiteProtocolSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
});
