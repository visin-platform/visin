import { createJobBodySchema, listJobsQuerySchema, materializeBodySchema } from '../../validation/jobSchemas';

const validBody = {
  name: 'Mask verification',
  groupId: 'g1',
  taskType: 'mask_toggle',
  question: { prompt: 'Mark all incorrect masks' },
};

describe('createJobBodySchema', () => {
  it('accepts a minimal mask_toggle job and applies defaults', () => {
    const parsed = createJobBodySchema.parse(validBody);

    expect(parsed.redundancy).toBe(1);
    expect(parsed.annotationSets).toEqual([]);
    expect(parsed.bundleId).toBeUndefined();
    expect(parsed.question.choices).toBeUndefined();
  });

  it('accepts bundleId and annotationSets', () => {
    const parsed = createJobBodySchema.parse({
      ...validBody,
      bundleId: 'b1',
      annotationSets: ['llava_34b'],
    });

    expect(parsed.bundleId).toBe('b1');
    expect(parsed.annotationSets).toEqual(['llava_34b']);
  });

  it('accepts a single_choice job with choices', () => {
    const parsed = createJobBodySchema.parse({
      ...validBody,
      taskType: 'single_choice',
      question: {
        prompt: 'Frame quality?',
        choices: [
          { key: 'good', label: 'Good', hotkey: 'g' },
          { key: 'bad', label: 'Bad' },
        ],
      },
      redundancy: 2,
    });

    expect(parsed.redundancy).toBe(2);
    expect(parsed.question.choices).toHaveLength(2);
  });

  it('rejects missing prompt, unknown task type, and single-choice with one option', () => {
    expect(createJobBodySchema.safeParse({ ...validBody, question: {} }).success).toBe(false);
    expect(createJobBodySchema.safeParse({ ...validBody, taskType: 'bbox_draw' }).success).toBe(false);
    expect(
      createJobBodySchema.safeParse({
        ...validBody,
        question: { prompt: 'p', choices: [{ key: 'only', label: 'Only' }] },
      }).success
    ).toBe(false);
  });

  it('rejects multi-character hotkeys and out-of-range redundancy', () => {
    expect(
      createJobBodySchema.safeParse({
        ...validBody,
        question: {
          prompt: 'p',
          choices: [
            { key: 'a', label: 'A', hotkey: 'aa' },
            { key: 'b', label: 'B' },
          ],
        },
      }).success
    ).toBe(false);
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
      content: 'filename\na.png',
    });
  });

  it('accepts the filter path with sampleN + seed', () => {
    expect(materializeBodySchema.parse({ kind: 'filter', sampleN: 100, seed: 7 })).toEqual({
      kind: 'filter',
      sampleN: 100,
      seed: 7,
    });
    expect(materializeBodySchema.parse({ kind: 'filter' })).toEqual({ kind: 'filter' });
  });

  it('rejects unknown kinds and non-positive sampleN', () => {
    expect(materializeBodySchema.safeParse({ kind: 'query' }).success).toBe(false);
    expect(materializeBodySchema.safeParse({ kind: 'filter', sampleN: 0 }).success).toBe(false);
  });
});
