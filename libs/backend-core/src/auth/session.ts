import mongoose from 'mongoose';
import type { UserPayload } from '../types/auth';

/** Read the auth-owned users collection through the same database used by API keys. */
export async function isCurrentSession(claims: unknown): Promise<boolean> {
  if (!claims || typeof claims !== 'object') return false;
  const user = claims as Partial<UserPayload>;
  if (typeof user.id !== 'string' || !/^[a-f\d]{24}$/i.test(user.id) ||
      typeof user.email !== 'string' || !user.email ||
      !Number.isSafeInteger(user.tokenVersion) || (user.tokenVersion as number) < 1) return false;
  // Do not buffer an authentication query while the database is unavailable.
  if (mongoose.connection.readyState !== 1) return false;
  const account = await mongoose.connection.collection('users').findOne(
    { _id: new mongoose.Types.ObjectId(user.id), email: user.email.toLowerCase(), tokenVersion: user.tokenVersion },
    { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 }
  );
  return account !== null;
}
