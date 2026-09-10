import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import { User, IUser } from '../models/User';
import { hashPassword } from './passwordService';

interface FirstUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/** Explicit even when production disables automatic index creation. */
export const initializeBootstrap = async (): Promise<void> => {
  await User.createIndexes();
};

/** Legacy non-empty installations must never become public setup candidates. */
export const needsSetup = async (): Promise<boolean> => !(await User.exists({}));

export const assertRegistrationOpen = async (): Promise<void> => {
  if (await needsSetup()) throw new ConflictError('Complete initial setup before registering');
};

export const createFirstUser = async ({ email, password, firstName, lastName }: FirstUserInput): Promise<IUser> => {
  if (!(await needsSetup())) throw new ConflictError('Setup has already been completed');
  const passwordHash = await hashPassword(password);
  try {
    // A unique partial index arbitrates concurrent attempts, while each account
    // keeps its own random identity. No separate lock or transaction is needed.
    return await User.create({
      email: email.toLowerCase(), firstName, lastName, signupMethod: 'password',
      passwordHash, roles: ['admin'], bootstrapSlot: 'initial-admin', lastLoginAt: new Date(),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ConflictError('Setup has already been completed');
    }
    // An insert may have committed despite a transport error. Never delete or
    // reset its claim here; the owner can recover by signing in normally.
    throw error;
  }
};

/** Local operator recovery only; this function has no public HTTP route. */
export const recoverAdministrator = async (userId: string): Promise<IUser> => {
  if (!/^[a-f\d]{24}$/i.test(userId)) throw new BadRequestError('A valid existing user ID is required');
  const user = await User.findByIdAndUpdate(userId, { $addToSet: { roles: 'admin' } }, { new: true });
  if (!user) throw new NotFoundError('User not found; recovery does not create accounts');
  return user;
};
