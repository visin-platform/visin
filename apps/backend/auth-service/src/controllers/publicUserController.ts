import { Request, Response } from 'express';
import { NotFoundError } from '@visin/backend-core';
import { User, type IUser } from '../models/User';
import { ensureHandle } from '../services/handleService';
import { escapeRegex } from '../utils/escapeRegex';

const PUBLIC_FIELDS = 'handle firstName lastName picture bio links profilePublic showActivity createdAt';

/**
 * What the world may know of an account: never the email, and a name only as
 * the person gave it (the handle where they gave none), so there is nothing here
 * to fall back to that was not chosen to be shown.
 */
export const toPublicUser = (user: IUser) => ({
  id: user._id.toString(),
  handle: user.handle as string,
  name: [user.firstName, user.lastName].filter(Boolean).join(' ') || (user.handle as string),
  ...(user.picture ? { picture: user.picture } : {}),
  ...(user.bio ? { bio: user.bio } : {}),
  links: user.links ?? [],
  /** Whether the page may list what they have been doing. */
  showActivity: user.showActivity !== false,
  createdAt: user.createdAt.toISOString()
});

/**
 * An account's public page, for anyone. An account that hid its profile reads as not
 * found, the same as one that never existed, so the answer does not say which.
 */
export const getPublicUser = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findOne({ handle: req.params.handle }).select(PUBLIC_FIELDS);
  if (!user || user.profilePublic === false) {
    throw new NotFoundError('No such user');
  }
  res.json({ success: true, data: toPublicUser(user) });
};

/**
 * Names and avatars for the owners of what other services list, in one call. An owner
 * with a hidden profile comes back as a bare id: the service shows that something is
 * owned, and by whom only as far as the owner agreed. Unknown ids are left out.
 */
export const lookupPublicUsers = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as { ids: string[] };
  const users = await User.find({ _id: { $in: ids } }).select(PUBLIC_FIELDS);
  const data = await Promise.all(
    users.map(async (user) => {
      if (user.profilePublic === false) return { id: user._id.toString() };
      // Reading is what gives a pre-handle account its handle, so its page can be linked.
      await ensureHandle(user);
      const { id, handle, name, picture } = toPublicUser(user);
      return { id, handle, name, ...(picture ? { picture } : {}) };
    })
  );
  res.json({ success: true, data });
};

/**
 * People by the start of their handle or of either part of their name, for the app's search. Only accounts with a
 * public page are found, and only what a listing needs of them: never the email, a bio or links. Handles are stored
 * in lowercase, so that half of the match can use the handle index.
 */
export const searchPublicUsers = async (req: Request, res: Response): Promise<void> => {
  const { q, limit } = req.query as unknown as { q: string; limit: number };
  const text = new RegExp(`^${escapeRegex(q)}`, 'i');
  const users = await User.find({
    profilePublic: { $ne: false },
    handle: { $type: 'string' },
    $or: [{ handle: new RegExp(`^${escapeRegex(q.toLowerCase())}`) }, { firstName: text }, { lastName: text }]
  })
    .select(PUBLIC_FIELDS)
    .sort({ handle: 1 })
    .limit(limit);
  res.json({
    success: true,
    data: users.map((user) => {
      const { id, handle, name, picture } = toPublicUser(user);
      return { id, handle, name, ...(picture ? { picture } : {}) };
    })
  });
};
