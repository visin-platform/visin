import mongoose from 'mongoose';
import { managedAssistant } from './assistantAvailability';
import { NotFoundError } from '@visin/backend-core';
import { Assistant } from '../models/Assistant';
import { revokeAssistantWork } from './sharedAssistants';
import { assistantInput } from '../validation/assistantSchemas';
import { parsed } from '../validation/parse';

export async function listAssistants(userId: string) {
  return await Assistant.find(managedAssistant(userId)).sort({ createdAt: 1 });
}

export async function createAssistant(userId: string, body: unknown) {
  const input = parsed(assistantInput, body);
  const assistant = await Assistant.create({ ...input, createdBy: userId });
  return assistant;
}

export async function updateAssistant(userId: string, assistantId: string, body: unknown) {
  const input = parsed(assistantInput, body);
  const assistant = await Assistant.findOneAndUpdate(
    { _id: assistantId, ...managedAssistant(userId) },
    { $set: input },
    { returnDocument: 'after', runValidators: true }
  );
  if (!assistant) throw new NotFoundError('Assistant not found');
  if (input.paused) await revokeAssistantWork(assistant.id);
  if (assistant.profileUserId)
    await mongoose.connection
      .collection('users')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(assistant.profileUserId), kind: 'assistant', assistantId: assistant.id },
        { $set: { firstName: assistant.name, lastName: '', assistantPaused: assistant.paused, updatedAt: new Date() } }
      );
  return assistant;
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
