import { createJobBodySchema } from '../../validation/jobSchemas';

const validBody = {
  name: 'Mask verification',
  groupId: 'g1',
  taskType: 'mask_toggle',
  question: { prompt: 'Mark all incorrect masks' },
};

describe('createJobBodySchema', () => {
  it('accepts a minimal mask_toggle job and defaults redundancy to 1', () => {
    const parsed = createJobBodySchema.parse(validBody);

    expect(parsed.redundancy).toBe(1);
    expect(parsed.question.choices).toBeUndefined();
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
