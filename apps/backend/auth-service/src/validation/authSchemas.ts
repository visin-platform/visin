import { z } from '@visin/backend-core';
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
