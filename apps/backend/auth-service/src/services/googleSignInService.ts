import { ConflictError, UnauthorizedError } from '@visin/backend-core';
import type { TokenPayload } from 'google-auth-library';
import { User, IUser } from '../models/User';
import { assertRegistrationOpen } from './bootstrapService';

const EMAIL_TAKEN = 'An account with this email already exists. Sign in with its password, then link Google sign-in.';

/**
 * Resolves a verified Google identity to an account, in order of authority:
 *
 * 1. The account bound to this Google `sub`, whatever email Google reports now.
 * 2. An account created by Google sign-up before subjects were stored. It is
 *    bound on first use: its address came from a Google-verified token and it
 *    has no password, so no password registration can have claimed it.
 * 3. Otherwise sign-up: a new account bound to this subject, behind the same
 *    gate as password registration.
 *
 * Any other account with this email (a password account, or one already bound
 * to a different subject) is never entered through Google. Its owner signs in
 * with the password and links Google deliberately.
 */
export async function signInWithGoogle(identity: TokenPayload): Promise<IUser> {
  const { sub } = identity;
  const bound = await User.findOne({ googleSubject: sub });
  if (bound) return bound;

  if (identity.email_verified !== true || !identity.email) {
    throw new UnauthorizedError('Google has not verified this account\'s email address');
  }
  const email = identity.email.toLowerCase();
  try {
    const legacy = await User.findOneAndUpdate(
      { email, signupMethod: 'google', googleSubject: { $exists: false }, passwordHash: { $exists: false } },
      { $set: { googleSubject: sub } },
      { new: true }
    );
    if (legacy) return legacy;
    if (await User.exists({ email })) return await concurrentWinner(sub);
    await assertRegistrationOpen();
    return await User.create({
      email,
      firstName: identity.given_name,
      lastName: identity.family_name,
      signupMethod: 'google',
      googleSubject: sub,
      roles: [],
      lastLoginAt: new Date()
    });
  } catch (error) {
    // The unique email and subject indexes arbitrate concurrent first sign-ins.
    if ((error as { code?: number }).code === 11000) return concurrentWinner(sub);
    throw error;
  }
}

/** A concurrent first sign-in with the same subject may already have bound or created the account. */
async function concurrentWinner(sub: string): Promise<IUser> {
  const winner = await User.findOne({ googleSubject: sub });
  if (!winner) throw new ConflictError(EMAIL_TAKEN);
  return winner;
}
