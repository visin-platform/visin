import {
  boxObjectSchema,
  finishBodySchema,
  MAX_OBJECTS_PER_FRAME,
  nextBodySchema,
  saveAnnotationBodySchema,
  taskAtParamsSchema
} from '../../validation/taskSchemas';

const box = { id: 'o1', classKey: 'car', bbox: [10, 20, 30, 40] };

describe('saveAnnotationBodySchema', () => {
  it('accepts boxes, defaulting where they came from to a person', () => {
    const parsed = saveAnnotationBodySchema.parse({ objects: [box], elapsedMs: 1200 });

    expect(parsed.objects[0].source).toBe('human');
    expect(parsed.elapsedMs).toBe(1200);
  });

  it('accepts an empty list, which is how a frame with nothing on it is saved', () => {
    expect(saveAnnotationBodySchema.parse({ objects: [] })).toEqual({ objects: [] });
  });

  it('keeps the source and score of an accepted suggestion', () => {
    expect(boxObjectSchema.parse({ ...box, source: 'model', score: 0.9 })).toMatchObject({ source: 'model', score: 0.9 });
    expect(boxObjectSchema.safeParse({ ...box, score: 1.5 }).success).toBe(false);
    expect(boxObjectSchema.safeParse({ ...box, source: 'robot' }).success).toBe(false);
  });

  it('rejects malformed boxes', () => {
    expect(boxObjectSchema.safeParse({ ...box, bbox: [1, 2, 3] }).success).toBe(false);
    expect(boxObjectSchema.safeParse({ ...box, bbox: [1, 2, 3, Number.NaN] }).success).toBe(false);
    expect(boxObjectSchema.safeParse({ ...box, id: '' }).success).toBe(false);
    expect(boxObjectSchema.safeParse({ ...box, classKey: '' }).success).toBe(false);
  });

  it('caps the objects on one frame, and refuses negative time', () => {
    const many = Array.from({ length: MAX_OBJECTS_PER_FRAME + 1 }, (_, i) => ({ ...box, id: `o${i}` }));
    expect(saveAnnotationBodySchema.safeParse({ objects: many }).success).toBe(false);
    expect(saveAnnotationBodySchema.safeParse({ objects: [], elapsedMs: -5 }).success).toBe(false);
  });
});

describe('finishBodySchema', () => {
  it('takes an optional elapsed time and nothing else', () => {
    expect(finishBodySchema.parse({})).toEqual({});
    expect(finishBodySchema.parse({ elapsedMs: 40 })).toEqual({ elapsedMs: 40 });
    expect(finishBodySchema.safeParse({ elapsedMs: -1 }).success).toBe(false);
  });
});

describe('nextBodySchema and taskAtParamsSchema', () => {
  it('defaults the excluded tasks to none and limits them to ids', () => {
    expect(nextBodySchema.parse({})).toEqual({ excludeTaskIds: [] });
    expect(nextBodySchema.safeParse({ excludeTaskIds: ['nope'] }).success).toBe(false);
  });

  it('coerces a position from the path', () => {
    expect(taskAtParamsSchema.parse({ id: '0123456789abcdef01234567', index: '4' }).index).toBe(4);
    expect(taskAtParamsSchema.safeParse({ id: '0123456789abcdef01234567', index: '-1' }).success).toBe(false);
  });
});
