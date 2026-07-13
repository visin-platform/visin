import {
  validateTokenBodySchema,
  invalidateUserTokensBodySchema,
  approveUserBodySchema,
  updateProfileBodySchema,
} from '../../validation/authSchemas';

describe('authSchemas', () => {
  it('validateTokenBodySchema requires a non-empty idToken', () => {
    expect(validateTokenBodySchema.safeParse({ idToken: 'abc' }).success).toBe(true);
    expect(validateTokenBodySchema.safeParse({ idToken: '' }).success).toBe(false);
    expect(validateTokenBodySchema.safeParse({}).success).toBe(false);
  });

  it('invalidateUserTokensBodySchema requires a non-empty email', () => {
    expect(invalidateUserTokensBodySchema.safeParse({ email: 'a@b.c' }).success).toBe(true);
    expect(invalidateUserTokensBodySchema.safeParse({ email: '' }).success).toBe(false);
  });

  it('approveUserBodySchema requires a non-empty email', () => {
    expect(approveUserBodySchema.safeParse({ email: 'a@b.c' }).success).toBe(true);
    expect(approveUserBodySchema.safeParse({}).success).toBe(false);
  });

  it('updateProfileBodySchema allows partial updates', () => {
    expect(updateProfileBodySchema.safeParse({}).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ firstName: 'Test' }).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ firstName: 1 }).success).toBe(false);
  });
});
