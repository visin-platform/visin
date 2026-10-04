import { Request, Response } from 'express';
import { UpdateQuery } from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError, logger } from '@visin/backend-core';
import { User, IUser } from '../models/User';
import { hashPassword, verifyPassword } from '../services/passwordService';
import { continueSessionAlone } from '../services/sessionService';
import { ensureHandle } from '../services/handleService';

/** The fields of an account's public page that its owner edits, as the settings screen shows them. */
const profileFields = (user: IUser) => ({
  handle: user.handle,
  bio: user.bio,
  links: user.links ?? [],
  profilePublic: user.profilePublic !== false
});

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  // passwordHash is select:false, so ask for it — only its presence is reported.
  const dbUser = await User.findById(req.user.id).select('+passwordHash');
  if (!dbUser) {
    throw new NotFoundError('User not found');
  }

  // An account older than handles gets its first one here.
  await ensureHandle(dbUser);

  // Combine JWT user data with database user data
  const userResponse = {
    id: req.user.id,
    email: req.user.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    name: req.user.name,
    picture: req.user.picture,
    ...profileFields(dbUser),
    // Drives whether the account settings offer "set" or "change" a password,
    // and whether the current password is required to do it.
    hasPassword: Boolean(dbUser.passwordHash)
  };

  res.json({ success: true, user: userResponse });
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { firstName, lastName, handle, bio, links, profilePublic } = req.body;

  // Update the user in database - handle empty strings explicitly
  const updateData: UpdateQuery<IUser> = {};
  if (firstName !== undefined) {
    const trimmedFirstName = firstName.trim();
    updateData.firstName = trimmedFirstName === '' ? null : trimmedFirstName;
  }
  if (lastName !== undefined) {
    const trimmedLastName = lastName.trim();
    updateData.lastName = trimmedLastName === '' ? null : trimmedLastName;
  }

  if (handle !== undefined) updateData.handle = handle;
  if (bio !== undefined) updateData.bio = bio === '' ? null : bio;
  if (links !== undefined) updateData.links = links;
  if (profilePublic !== undefined) updateData.profilePublic = profilePublic;

  let updatedUser: IUser | null;
  try {
    updatedUser = await User.findByIdAndUpdate(req.user.id, { $set: updateData }, { returnDocument: 'after' });
  } catch (error) {
    // The unique index is what decides who has a handle, however many ask at once.
    if ((error as { code?: number }).code === 11000) throw new ConflictError('That handle is taken');
    throw error;
  }

  if (!updatedUser) {
    throw new NotFoundError('User not found');
  }

  // Return updated user info
  res.json({
    success: true,
    user: {
      id: updatedUser._id.toString(),
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      name: req.user.name, // Keep original name from JWT
      picture: req.user.picture, // Keep original picture from JWT
      ...profileFields(updatedUser)
    }
  });
};

/**
 * Sets or changes the signed-in user's password.
 *
 * An account created through Google has no password yet; for those the session
 * itself is the proof of identity, so no current password is asked for. Once a
 * password exists it must be supplied, so that a hijacked session cannot lock
 * the owner out by silently replacing it.
 *
 * Either way `tokenVersion` is bumped, which invalidates every other
 * outstanding session — then a fresh cookie is issued so the browser doing the
 * change stays signed in.
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword: string };

  const dbUser = await User.findById(req.user.id).select('+passwordHash');
  if (!dbUser) {
    throw new NotFoundError('User not found');
  }

  if (dbUser.passwordHash) {
    if (!currentPassword) {
      throw new BadRequestError('Your current password is required to change it');
    }
    if (!(await verifyPassword(currentPassword, dbUser.passwordHash))) {
      throw new UnauthorizedError('Current password is incorrect');
    }
  }

  const hadPassword = Boolean(dbUser.passwordHash);
  const updated = await User.findByIdAndUpdate(
    req.user.id,
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new NotFoundError('User not found');
  }

  // The bump above invalidated every outstanding token, including the one this
  // request arrived with. Every other session ends; this one is re-signed from
  // the *updated* document, or the caller would be signed out by its own change.
  const { token } = await continueSessionAlone(req, res, updated);

  logger.info('Password set', { email: updated.email, wasFirstTime: !hadPassword });

  res.json({
    success: true,
    hasPassword: true,
    token,
    message: hadPassword ? 'Password updated. Other sessions have been signed out.' : 'Password set'
  });
};
