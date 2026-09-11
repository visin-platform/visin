import { ConflictError, ForbiddenError, UnauthorizedError } from '@visin/backend-core';
import { User } from '../models/User';
import { verifyGoogleToken } from './googleAuthService';
import { verifyPassword } from './passwordService';

export async function linkGoogleAccount(userId: string, tokenVersion: number | undefined, currentPassword: string, idToken: string) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new ForbiddenError('Google sign-in is not configured on this instance');
  if (tokenVersion == null) throw new UnauthorizedError('Sign in again before linking Google');
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !await verifyPassword(currentPassword, user.passwordHash)) {
    throw new UnauthorizedError('Current password is incorrect. Set a password first if your account has none.');
  }
  let identity;
  try {
    identity = await verifyGoogleToken(idToken);
  } catch {
    throw new UnauthorizedError('Invalid Google token');
  }
  if (typeof identity?.sub !== 'string' || !identity.sub) throw new UnauthorizedError('Invalid Google token');
  try {
    const linked = await User.findOneAndUpdate(
      { _id: userId, tokenVersion, passwordHash: user.passwordHash, googleSubject: { $exists: false } },
      { $set: { googleSubject: identity.sub }, $inc: { tokenVersion: 1 } },
      { new: true }
    );
    if (!linked) throw new ConflictError('Account changed or Google is already linked. Sign in again.');
    return linked;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ConflictError('That Google account is already linked');
    }
    throw error;
  }
}
