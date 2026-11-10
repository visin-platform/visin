import mongoose from 'mongoose';
import { managedAssistant, usableAssistant } from './assistantAvailability';
import { NotFoundError } from '@visin/backend-core';
import { Assistant } from '../models/Assistant';
import { revokeAssistantWork } from './sharedAssistants';
import { assistantInput } from '../validation/assistantSchemas';
import { parsed } from '../validation/parse';

type AssistantDoc = InstanceType<typeof Assistant>;

/** An assistant as its manager sees it: whether it is theirs by default, and never who else has it so. */
export function assistantView(assistant: AssistantDoc, userId: string) {
  const { defaultForUserIds, ...rest } = assistant.toJSON() as Record<string, unknown> & {
    defaultForUserIds?: string[];
  };
  return { ...rest, isDefault: (defaultForUserIds ?? []).includes(userId) };
}

/** Makes one assistant this person's default, and no other. Turning it off leaves them with the built-in analyst. */
async function setDefault(userId: string, assistantId: string, on: boolean) {
  if (on) {
    await Assistant.updateMany(
      { defaultForUserIds: userId, _id: { $ne: assistantId } },
      { $pull: { defaultForUserIds: userId } }
    );
    await Assistant.updateOne({ _id: assistantId }, { $addToSet: { defaultForUserIds: userId } });
  } else await Assistant.updateOne({ _id: assistantId }, { $pull: { defaultForUserIds: userId } });
}

/**
 * The assistant a new private analysis starts with for this person: the one they chose as their default, if it can still
 * be used (not paused or removed). Otherwise use the published platform default; only an unconfigured deployment uses the built-in analyst.
 */
export async function defaultAssistantFor(userId: string) {
  return (
    (await Assistant.findOne({ defaultForUserIds: userId, ...usableAssistant(userId) }).select('_id name')) ??
    (await Assistant.findOne({ platformDefault: true, published: true, paused: false, deletedAt: null }).select(
      '_id name'
    ))
  );
}

export async function listAssistants(userId: string) {
  const rows = await Assistant.find(managedAssistant(userId)).select('+defaultForUserIds').sort({ createdAt: 1 });
  return rows.map((row) => assistantView(row, userId));
}

export async function createAssistant(userId: string, body: unknown) {
  const { default: makeDefault, ...input } = parsed(assistantInput, body);
  const assistant = await Assistant.create({ ...input, createdBy: userId });
  // A platform default remains selected unless this person explicitly chooses another assistant.
  const has = await defaultAssistantFor(userId);
  if (makeDefault ?? !has) await setDefault(userId, assistant.id, true);
  return (await Assistant.findById(assistant.id).select('+defaultForUserIds'))!;
}

export async function updateAssistant(userId: string, assistantId: string, body: unknown) {
  const { default: makeDefault, ...input } = parsed(assistantInput, body);
  const assistant = await Assistant.findOneAndUpdate(
    { _id: assistantId, ...managedAssistant(userId) },
    { $set: input },
    { returnDocument: 'after', runValidators: true }
  );
  if (!assistant) throw new NotFoundError('Assistant not found');
  if (makeDefault !== undefined) await setDefault(userId, assistant.id, makeDefault);
  if (input.paused) await revokeAssistantWork(assistant.id);
  if (assistant.profileUserId)
    await mongoose.connection
      .collection('users')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(assistant.profileUserId), kind: 'assistant', assistantId: assistant.id },
        { $set: { firstName: assistant.name, lastName: '', assistantPaused: assistant.paused, updatedAt: new Date() } }
      );
  return (await Assistant.findById(assistant.id).select('+defaultForUserIds'))!;
}

export async function deleteAssistant(userId: string, assistantId: string) {
  const manager = { _id: assistantId, $or: [{ createdBy: userId }, { managerIds: userId }] };
  const assistant =
    (await Assistant.findOneAndUpdate(
      { ...manager, deletedAt: null },
      { $set: { deletedAt: new Date(), paused: true } }
    )) || (await Assistant.findOne(manager));
  // Retrying removal must repair a failed public-profile write after soft deletion.
  if (!assistant) throw new NotFoundError('Assistant not found');
  await revokeAssistantWork(assistant.id);
  if (assistant.profileUserId)
    await mongoose.connection
      .collection('users')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(assistant.profileUserId), kind: 'assistant', assistantId: assistant.id },
        { $set: { profilePublic: false, assistantPaused: true, updatedAt: new Date() } }
      );
  return { deleted: true };
}

/** Catalog has only intentionally public metadata; private instructions and ownership are omitted. */
export async function listPublicAssistants() {
  const rows = await Assistant.find({ published: true, deletedAt: null })
    .select('name paused profileUserId')
    .sort({ name: 1 });
  return rows.map((row) => ({ _id: row.id, name: row.name, paused: row.paused, profileUserId: row.profileUserId }));
}
