import mongoose from 'mongoose';
import { avatarUrl, checkAvatar, NotFoundError, ServiceUnavailableError } from '@visin/backend-core';
import { Avatar } from '../models/Avatar';
import { User } from '../models/User';

/**
 * Bot identity links are public; management authority comes from the live chat definition: its creator and managers,
 * and, for the platform's own assistant (Vivi), any active platform administrator.
 */
async function managedBot(actorId: string, userId: string) {
  if (!mongoose.isValidObjectId(userId)) throw new NotFoundError('Bot not found');
  const [user, admin] = await Promise.all([
    User.findOne({ _id: userId, kind: 'assistant' }).select('_id assistantId'),
    mongoose.isValidObjectId(actorId)
      ? User.exists({ _id: actorId, roles: 'admin', status: { $nin: ['suspended', 'deleted'] } })
      : null
  ]);
  if (!user?.assistantId || !mongoose.isValidObjectId(user.assistantId)) throw new NotFoundError('Bot not found');
  const allowed = await mongoose.connection.collection('chatassistants').findOne(
    {
      _id: new mongoose.Types.ObjectId(user.assistantId),
      profileUserId: user.id,
      deletedAt: null,
      $or: [{ createdBy: actorId }, { managerIds: actorId }, ...(admin ? [{ platformDefault: true }] : [])]
    },
    { projection: { _id: 1 } }
  );
  if (!allowed) throw new NotFoundError('Bot not found');
  return user;
}

export async function uploadBotPicture(actorId: string, userId: string, body: unknown) {
  const user = await managedBot(actorId, userId);
  const { data, contentType } = checkAvatar(body);
  const now = new Date();
  const picture = avatarUrl(`/auth/avatars/${user.id}`, now, ['AUTH_SERVICE_PUBLIC_URL', 'AUTH_SERVICE_URL']);
  if (!picture) throw new ServiceUnavailableError('Picture uploads need a public auth-service address');
  await Avatar.findOneAndUpdate(
    { userId: user._id },
    { $set: { data, contentType, updatedAt: now } },
    { upsert: true }
  );
  await User.updateOne({ _id: user._id, kind: 'assistant' }, { $set: { picture, avatarUpdatedAt: now } });
  return { picture };
}

export async function removeBotPicture(actorId: string, userId: string) {
  const user = await managedBot(actorId, userId);
  await Avatar.deleteOne({ userId: user._id });
  await User.updateOne({ _id: user._id, kind: 'assistant' }, { $unset: { picture: '', avatarUpdatedAt: '' } });
}

/** Managers can preview an uploaded picture before making the bot public. */
export async function getBotPicture(actorId: string, userId: string) {
  const user = await managedBot(actorId, userId);
  const avatar = await Avatar.findOne({ userId: user._id });
  if (!avatar) throw new NotFoundError('No such picture');
  return avatar;
}
