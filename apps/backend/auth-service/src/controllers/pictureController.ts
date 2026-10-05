import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { avatarUrl, checkAvatar, NotFoundError, UnauthorizedError } from '@visin/backend-core';
import { Avatar } from '../models/Avatar';
import { User } from '../models/User';
import { renewSession } from '../services/sessionService';

/**
 * Sets the signed-in account's picture. The body is the image itself (JPEG, PNG or WebP, which the app has already
 * shrunk), checked by its bytes. The account's `picture` becomes this service's address for it, so everything that
 * lists the account as an owner shows the new picture without knowing where it came from, and the session's token is
 * re-signed to carry it. 501 where this deployment has no public address for the service to hand out.
 */
export const uploadPicture = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  const { data, contentType } = checkAvatar(req.body);
  const now = new Date();
  const picture = avatarUrl(`/auth/avatars/${req.user.id}`, now, ['AUTH_SERVICE_PUBLIC_URL', 'AUTH_SERVICE_URL']);
  if (!picture) {
    res.status(501).json({
      success: false,
      message: "Picture uploads need AUTH_SERVICE_PUBLIC_URL set to this service's public address"
    });
    return;
  }

  await Avatar.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { contentType, data, updatedAt: now } },
    { upsert: true }
  );
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { picture, avatarUpdatedAt: now } });
  if (!user) throw new NotFoundError('User not found');

  req.user.picture = picture;
  await renewSession(req, res);
  res.json({ success: true, data: { picture } });
};

/** Removes the uploaded picture; the account then has none until Google shows one at the next sign-in. */
export const removePicture = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new UnauthorizedError('Not authenticated');
  await Avatar.deleteOne({ userId: req.user.id });
  await User.updateOne({ _id: req.user.id }, { $unset: { picture: '', avatarUpdatedAt: '' } });

  req.user.picture = undefined;
  await renewSession(req, res);
  res.json({ success: true, data: {} });
};

/**
 * An account's uploaded picture, for anyone: it is what an `<img>` on a public page loads. An account that hid its
 * page, one with no picture of its own and one that does not exist all answer the same 404. Always revalidated (an
 * ETag, so an unchanged picture is a 304), and so never left standing in a browser or proxy after it is hidden.
 */
export const getPicture = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.userId);
  if (!mongoose.isValidObjectId(id)) throw new NotFoundError('No such picture');
  const user = await User.findById(id).select('profilePublic avatarUpdatedAt');
  if (!user || user.profilePublic === false || !user.avatarUpdatedAt) throw new NotFoundError('No such picture');
  const avatar = await Avatar.findOne({ userId: id });
  if (!avatar) throw new NotFoundError('No such picture');

  const etag = `"${avatar.updatedAt.getTime()}"`;
  res.set({
    'Cache-Control': 'no-cache',
    ETag: etag,
    // Served from this service's own origin, so it can only ever be an image: no sniffing, and nothing it could run.
    'Content-Type': avatar.contentType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  });
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.status(200).send(avatar.data);
};
