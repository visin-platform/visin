import { z, API_KEY_SCOPES } from '@visin/backend-core';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../services/passwordService';

const email = z.string().trim().toLowerCase().email('A valid email is required');
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, 'Password is too long');
const name = z.string().trim().max(100).optional();

export const setupBodySchema = z.object({ email, password, firstName: name, lastName: name });
export const registerBodySchema = z.object({ email, password, firstName: name, lastName: name });

export const changePasswordBodySchema = z.object({
  // Absent when the account has no password yet (a Google-created account).
  currentPassword: z.string().min(1).optional(),
  newPassword: password
});

// Deliberately not reusing `password` here: rejecting a short password at the
// login endpoint would tell an attacker the policy applies to a real account,
// and would lock out anyone whose password predates a policy change.
export const loginBodySchema = z.object({ email, password: z.string().min(1, 'Password is required') });

export const validateTokenBodySchema = z.object({
  idToken: z.string().min(1, 'Token is required')
});

export const invalidateUserTokensBodySchema = z.object({
  email: z.string().min(1, 'Email is required')
});

export const updateProfileBodySchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

/**
 * Issuing an API key.
 *
 * `scopes` is validated against the shared list rather than accepting any
 * string: a typo'd scope would be stored, shown in the UI as granted, and then
 * silently match nothing at the middleware — a permission that looks present
 * and is not.
 */
export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1, 'Give the key a name').max(60),
  scopes: z.array(z.enum(API_KEY_SCOPES)).max(API_KEY_SCOPES.length),
  // Capped at a year. A key that never expires is a credential nobody ever
  // revisits; an explicit `undefined` still means "no expiry", which is a
  // choice someone made rather than a default they inherited.
  expiresInDays: z.number().int().min(1).max(365).optional()
});
