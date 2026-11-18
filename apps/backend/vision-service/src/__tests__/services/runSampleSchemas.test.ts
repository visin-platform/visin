import { runSampleBatchSchema, runSampleSchema, sampleProtocolErrors } from '../../validation/runSampleSchemas';

const samples = {
  attrs: [{ key: 'class', values: ['pedestrian', 'vehicle'] }, { key: 'size' }, { key: 'pixels' }, { key: 'frame' }],
  fields: [{ key: 'verdict', values: ['valid', 'invalid', 'unclear'], abstain: 'unclear', required: true }],
  weight: 'pixels'
};
const suite = (sampleProtocol: typeof samples | Record<string, unknown> = samples) => ({
  classes: [{ id: 'pedestrian' }, { id: 'vehicle' }],
  conditions: [{ name: 'small', sampleCount: 1 }, { name: 'large', sampleCount: 1 }],
  samples: sampleProtocol
}) as unknown as Parameters<typeof sampleProtocolErrors>[1];
const protocol = suite();
const sample = { id: 'frame_1/m1', attrs: { class: 'pedestrian', size: 'small', pixels: 212, frame: 'frame_1' }, fields: { verdict: 'valid' } };

it('accepts a sample matching the suite, including open frame attributes and a numeric weight', () => {
  expect(sampleProtocolErrors(runSampleSchema.parse(sample), protocol)).toEqual([]);
});

it('allows a geometry-only decision to omit an optional raw verdict', () => {
  const geometry = { ...sample, fields: { outcome: 'delete' } };
  const geometryProtocol = suite({ ...samples, fields: [{ key: 'verdict', values: ['valid', 'invalid'] }, { key: 'outcome', values: ['keep', 'delete'], required: true }] });
  expect(sampleProtocolErrors(runSampleSchema.parse(geometry), geometryProtocol)).toEqual([]);
});

it('rejects undeclared keys, invalid vocabularies, missing fields and invalid weights', () => {
  const row = runSampleSchema.parse({ ...sample, attrs: { class: 'typo', size: 'small', pixels: -1, extra: 'x' }, fields: { typo: 'valid' } });
  expect(sampleProtocolErrors(row, protocol)).toEqual([
    'Invalid value for attribute: class', 'Unknown attribute: extra', 'Unknown field: typo', 'Missing field: verdict', 'Invalid weight: pixels'
  ]);
});

it('checks the UTF-8 byte limit and batch identity', () => {
  expect(runSampleSchema.safeParse({ ...sample, raw: 'é'.repeat(513) }).success).toBe(false);
  expect(runSampleBatchSchema.safeParse({ samples: [sample, sample] }).success).toBe(false);
  expect(runSampleBatchSchema.safeParse({ samples: [sample] }).success).toBe(true);
});

it('rejects invalid field values and missing weights', () => {
  const row = runSampleSchema.parse({ ...sample, attrs: { class: 'vehicle', size: 'large' }, fields: { verdict: 'typo' } });
  expect(sampleProtocolErrors(row, protocol)).toEqual(['Invalid value for field: verdict', 'Invalid weight: pixels']);
});

it('refuses a sample scoring could not place: no class or condition, or one the suite does not name', () => {
  const missing = runSampleSchema.parse({ ...sample, attrs: { pixels: 3 } });
  expect(sampleProtocolErrors(missing, protocol)).toEqual(['Missing attribute: class', 'Missing attribute: size']);
  const unknown = runSampleSchema.parse({ ...sample, attrs: { class: 'vehicle', size: 'huge', pixels: 3 } });
  expect(sampleProtocolErrors(unknown, protocol)).toEqual(["Attribute size must be one of the suite's conditions"]);
  expect(sampleProtocolErrors(runSampleSchema.parse(sample), { ...protocol, samples: undefined })).toEqual(['The suite is not sample-scored']);
});
