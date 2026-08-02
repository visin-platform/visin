import { Request, Response } from 'express';
import { UpdateQuery } from 'mongoose';
import { BadRequestError, NotFoundError, UnauthorizedError, logger } from '@visin/backend-core';
import { User, IUser } from '../models/User';
import { hashPassword, verifyPassword } from '../services/passwordService';
import { displayName as displayNameOf, issueSession } from '../services/sessionService';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthorizedError('Not authenticated');
  }

  // passwordHash is select:false, so ask for it — only its presence is reported.
  const dbUser = await User.findById(req.user.id).select('+passwordHash');
  if (!dbUser) {
    throw new NotFoundError('User not found');
  }

  // Combine JWT user data with database user data
  const userResponse = {
    id: req.user.id,
    email: req.user.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    name: req.user.name,
    picture: req.user.picture,
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

  const { firstName, lastName } = req.body;

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

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { $set: updateData },
    { new: true }
  );

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
      picture: req.user.picture // Keep original picture from JWT
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
    { new: true }
  );

  if (!updated) {
    throw new NotFoundError('User not found');
  }

  // The bump above invalidated every outstanding token, including the one this
  // request arrived with — so re-issue from the *updated* document, or the
  // caller would be signed out by its own password change.
  const { token } = await issueSession(res, updated, req.user.name || displayNameOf(updated));

  logger.info('Password set', { email: updated.email, wasFirstTime: !hadPassword });

  res.json({
    success: true,
    hasPassword: true,
    token,
    message: hadPassword ? 'Password updated. Other sessions have been signed out.' : 'Password set'
  });
};
