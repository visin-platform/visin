import {
  createJobBodySchema,
  exportQuerySchema,
  importQuerySchema,
  listJobsQuerySchema,
  materializeBodySchema,
  modelClassMappingBodySchema
} from '../../validation/jobSchemas';

const validBody = {
  name: 'Street scenes',
  datasetId: 'd1',
  sensors: [{ key: 'camera', group: 'frames' }],
  classes: [{ name: 'Car' }]
};

describe('modelClassMappingBodySchema', () => {
  it('accepts explicit names or resetting to name matching, and rejects invalid maps', () => {
    expect(modelClassMappingBodySchema.parse({ mapping: { vehicle: ' car ', human: null } })).toEqual({ mapping: { vehicle: 'car', human: null } });
    for (const mapping of [{}, { vehicle: '' }, { vehicle: 1 }, { vehicle: 'x'.repeat(61) }, Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`c${i}`, 'car']))]) {
      expect(modelClassMappingBodySchema.safeParse({ mapping }).success).toBe(false);
    }
  });
});

describe('createJobBodySchema', () => {
  it('accepts a minimal job and applies defaults', () => {
    const parsed = createJobBodySchema.parse(validBody);

    expect(parsed.taskType).toBe('annotate');
    expect(parsed.redundancy).toBe(1);
    expect(parsed.sensors[0].kind).toBe('image');
    expect(parsed.classes[0].tools).toEqual(['box', 'mask']);
    // A job follows its dataset, so it cannot be made without one.
    const { datasetId: _datasetId, ...withoutDataset } = validBody;
    expect(createJobBodySchema.safeParse(withoutDataset).success).toBe(false);
  });

  it('accepts camera, lidar and radar, where radar is a point list', () => {
    const parsed = createJobBodySchema.parse({
      ...validBody,
      sensors: [
        { key: 'camera', group: 'camera' },
        { key: 'lidar', group: 'lidar', variant: 'depth' },
        { key: 'radar', group: 'radar', kind: 'points' }
      ],
      classes: [{ name: 'Car', key: 'car', color: '#ff8800', hotkey: 'c', tools: ['box'], modelClass: 'car' }]
    });

    expect(parsed.sensors.map((sensor) => sensor.kind)).toEqual(['image', 'image', 'points']);
    expect(parsed.classes[0]).toMatchObject({ key: 'car', color: '#ff8800', tools: ['box'] });
  });

  it('needs exactly one camera, an image one, and each sensor once', () => {
    const parse = (sensors: unknown) => createJobBodySchema.safeParse({ ...validBody, sensors }).success;

    expect(parse([{ key: 'lidar', group: 'l' }])).toBe(false);
    expect(parse([{ key: 'camera', group: 'a' }, { key: 'camera', group: 'b' }])).toBe(false);
    expect(parse([{ key: 'camera', group: 'a', kind: 'points' }])).toBe(false);
    expect(parse([{ key: 'camera', group: 'a' }, { key: 'lidar', group: 'l' }])).toBe(true);
  });

  it('needs a class, and a valid key, colour and hotkey on each', () => {
    const parse = (classes: unknown) => createJobBodySchema.safeParse({ ...validBody, classes }).success;

    expect(parse([])).toBe(false);
    expect(parse([{ name: '' }])).toBe(false);
    expect(parse([{ name: 'Car', key: 'Not A Key' }])).toBe(false);
    expect(parse([{ name: 'Car', color: 'red' }])).toBe(false);
    expect(parse([{ name: 'Car', hotkey: 'ab' }])).toBe(false);
    expect(parse([{ name: 'Car', tools: [] }])).toBe(false);
    expect(parse([{ name: 'Car', tools: ['polygon'] }])).toBe(false);
  });

  it('rejects the old task types and out-of-range redundancy', () => {
    expect(createJobBodySchema.safeParse({ ...validBody, taskType: 'mask_toggle' }).success).toBe(false);
    expect(createJobBodySchema.safeParse({ ...validBody, redundancy: 0 }).success).toBe(false);
    expect(createJobBodySchema.safeParse({ ...validBody, redundancy: 11 }).success).toBe(false);
  });
});

describe('listJobsQuerySchema', () => {
  it('defaults role to worker and accepts admin', () => {
    expect(listJobsQuerySchema.parse({})).toEqual({ role: 'worker' });
    expect(listJobsQuerySchema.parse({ role: 'admin' })).toEqual({ role: 'admin' });
    expect(listJobsQuerySchema.safeParse({ role: 'boss' }).success).toBe(false);
  });
});

describe('materializeBodySchema', () => {
  it('accepts the manifest path with and without inline content', () => {
    expect(materializeBodySchema.parse({ kind: 'manifest' })).toEqual({ kind: 'manifest' });
    expect(materializeBodySchema.parse({ kind: 'manifest', content: 'filename\na.png', format: 'csv' })).toMatchObject({
      content: 'filename\na.png'
    });
  });

  it('accepts the filter path with sampleN + seed', () => {
    expect(materializeBodySchema.parse({ kind: 'filter', sampleN: 100, seed: 7 })).toEqual({
      kind: 'filter',
      sampleN: 100,
      seed: 7
    });
    expect(materializeBodySchema.parse({ kind: 'filter' })).toEqual({ kind: 'filter' });
  });

  it('rejects unknown kinds and non-positive sampleN', () => {
    expect(materializeBodySchema.safeParse({ kind: 'query' }).success).toBe(false);
    expect(materializeBodySchema.safeParse({ kind: 'filter', sampleN: 0 }).success).toBe(false);
  });
});

describe('exportQuerySchema', () => {
  it('defaults to the native bundle of finished frames', () => {
    expect(exportQuerySchema.parse({})).toEqual({ format: 'visin', include: 'done' });
  });

  it('accepts every format, the manifest, and drafts', () => {
    for (const format of ['yolo', 'coco', 'voc', 'semantic-png', 'visin', 'manifest']) {
      expect(exportQuerySchema.parse({ format }).format).toBe(format);
    }
    expect(exportQuerySchema.parse({ include: 'all' }).include).toBe('all');
    expect(exportQuerySchema.safeParse({ format: 'csv' }).success).toBe(false);
  });
});

describe('importQuerySchema', () => {
  it('defaults to a real import as suggestions with no class choices', () => {
    expect(importQuerySchema.parse({})).toEqual({ dryRun: 'false', as: 'suggestions', classMap: {} });
  });

  it('reads the class choices from their JSON form', () => {
    const parsed = importQuerySchema.parse({
      as: 'done',
      dryRun: 'true',
      format: 'coco',
      classMap: JSON.stringify({ person: 'pedestrian', bus: '+', junk: null })
    });

    expect(parsed).toMatchObject({ as: 'done', dryRun: 'true', format: 'coco' });
    expect(parsed.classMap).toEqual({ person: 'pedestrian', bus: '+', junk: null });
  });

  it('rejects class choices that are not a map of names to keys', () => {
    expect(importQuerySchema.safeParse({ classMap: 'not json' }).success).toBe(false);
    expect(importQuerySchema.safeParse({ classMap: '[1, 2]' }).success).toBe(false);
    expect(importQuerySchema.safeParse({ classMap: '{"a": 3}' }).success).toBe(false);
    expect(importQuerySchema.safeParse({ as: 'both' }).success).toBe(false);
  });
});
