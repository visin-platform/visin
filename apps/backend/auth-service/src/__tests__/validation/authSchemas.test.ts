import {
  validateTokenBodySchema,
  invalidateUserTokensBodySchema,
  updateProfileBodySchema,
  setupBodySchema,
  registerBodySchema,
  loginBodySchema,
  changePasswordBodySchema,
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

  it('updateProfileBodySchema allows partial updates', () => {
    expect(updateProfileBodySchema.safeParse({}).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ firstName: 'Test' }).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ firstName: 1 }).success).toBe(false);
  });

  it('setupBodySchema and registerBodySchema require a valid email and a long password', () => {
    const valid = { email: 'Owner@Example.com', password: 'a-strong-password' };

    for (const schema of [setupBodySchema, registerBodySchema]) {
      const parsed = schema.safeParse(valid);
      expect(parsed.success).toBe(true);
      // Normalised so a stored email is always comparable.
      expect(parsed.success && parsed.data.email).toBe('owner@example.com');

      expect(schema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
      expect(schema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
      expect(schema.safeParse({ ...valid, password: 'x'.repeat(201) }).success).toBe(false);
    }
  });

  it('loginBodySchema accepts any non-empty password', () => {
    // A password predating a policy change must still be submittable.
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
    expect(loginBodySchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('changePasswordBodySchema makes the current password optional but the new one strong', () => {
    // Absent for an account that has no password yet.
    expect(changePasswordBodySchema.safeParse({ newPassword: 'a-strong-password' }).success).toBe(true);
    expect(
      changePasswordBodySchema.safeParse({ currentPassword: 'old', newPassword: 'a-strong-password' }).success
    ).toBe(true);
    expect(changePasswordBodySchema.safeParse({ newPassword: 'short' }).success).toBe(false);
    expect(changePasswordBodySchema.safeParse({ currentPassword: '', newPassword: 'a-strong-password' }).success).toBe(
      false
    );
  });
});