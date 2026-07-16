import { answerBodySchema } from '../../validation/taskSchemas';

describe('answerBodySchema', () => {
  it('accepts a single_choice answer', () => {
    expect(answerBodySchema.parse({ choiceKey: 'good', elapsedMs: 1200 })).toEqual({
      choiceKey: 'good',
      elapsedMs: 1200,
    });
  });

  it('accepts a mask_toggle answer, including an empty rejection list', () => {
    expect(answerBodySchema.parse({ rejectedMaskIds: [] })).toEqual({ rejectedMaskIds: [] });
    expect(answerBodySchema.parse({ rejectedMaskIds: [0, 7] })).toEqual({ rejectedMaskIds: [0, 7] });
  });

  it('rejects an answer with neither field', () => {
    expect(answerBodySchema.safeParse({ elapsedMs: 5 }).success).toBe(false);
  });

  it('rejects negative mask ids and elapsedMs', () => {
    expect(answerBodySchema.safeParse({ rejectedMaskIds: [-1] }).success).toBe(false);
    expect(answerBodySchema.safeParse({ choiceKey: 'x', elapsedMs: -5 }).success).toBe(false);
  });
});
