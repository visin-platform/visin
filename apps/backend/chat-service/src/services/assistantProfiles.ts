import mongoose from 'mongoose';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';
import { z } from 'zod';
import { Assistant } from '../models/Assistant';
import { managedAssistant } from './assistantAvailability';
import { parsed } from '../validation/parse';

const profileInput = z
  .object({
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/),
    bio: z.string().trim().max(280).default(''),
    public: z.boolean()
  })
  .strict();
const RESERVED = new Set([
  'about',
  'account',
  'admin',
  'api',
  'assets',
  'datasets',
  'docs',
  'evaluations',
  'explore',
  'g',
  'help',
  'jobs',
  'leaderboards',
  'login',
  'logout',
  'me',
  'models',
  'new',
  'null',
  'projects',
  'register',
  'root',
  'search',
  'settings',
  'signup',
  'static',
  'suites',
  'support',
  'system',
  'trainings',
  'u',
  'undefined',
  'visin'
]);

/** Startup migration, not work for every profile edit. */
export async function initializeAssistantProfileIndexes() {
  const users = mongoose.connection.collection('users');
  await Promise.all([
    users.createIndex({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } }),
    users.createIndex(
      { assistantId: 1 },
      { unique: true, partialFilterExpression: { assistantId: { $type: 'string' } } }
    )
  ]);
}

export async function getAssistantProfile(userId: string, assistantId: string) {
  if (!(await Assistant.exists({ _id: assistantId, ...managedAssistant(userId) })))
    throw new NotFoundError('Assistant not found');
  const user = await mongoose.connection
    .collection('users')
    .findOne({ assistantId, kind: 'assistant' }, { projection: { handle: 1, bio: 1, profilePublic: 1, picture: 1 } });
  return user
    ? {
        handle: String(user.handle),
        bio: String(user.bio || ''),
        public: user.profilePublic === true,
        userId: user._id.toString(),
        picture: typeof user.picture === 'string' ? user.picture : undefined
      }
    : null;
}

/** A bot uses the same unique handle namespace and public directory as humans, with no login credentials. */
export async function saveAssistantProfile(userId: string, assistantId: string, body: unknown) {
  const input = parsed(profileInput, body);
  if (RESERVED.has(input.handle)) throw new BadRequestError('Choose another handle');
  const assistant = await Assistant.findOne({ _id: assistantId, ...managedAssistant(userId) });
  if (!assistant) throw new NotFoundError('Assistant not found');
  const users = mongoose.connection.collection('users');
  const managers = [...new Set([assistant.createdBy, ...assistant.managerIds])].filter((id) =>
    /^[a-f\d]{24}$/i.test(id)
  );
  try {
    const identity = await users.findOneAndUpdate(
      { assistantId, kind: 'assistant' },
      {
        $setOnInsert: {
          email: `${assistant.id}@bots.visin.invalid`,
          signupMethod: 'assistant',
          roles: [],
          tokenVersion: 1,
          createdAt: new Date(),
          links: [],
          showActivity: false
        },
        $set: {
          kind: 'assistant',
          assistantId,
          handle: input.handle,
          bio: input.bio,
          firstName: assistant.name,
          lastName: '',
          assistantPaused: assistant.paused,
          managerIds: managers,
          profilePublic: input.public,
          updatedAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    if (!identity) throw new Error('Could not save bot identity');
    const saved = await Assistant.updateOne(
      { _id: assistant.id, ...managedAssistant(userId) },
      {
        $set: { profileUserId: identity._id.toString(), published: input.public }
      }
    );
    if (!saved.matchedCount) {
      await users.updateOne({ _id: identity._id }, { $set: { profilePublic: false } });
      throw new ConflictError('Assistant changed; reload before publishing');
    }
    return {
      handle: input.handle,
      bio: input.bio,
      public: input.public,
      userId: identity._id.toString(),
      picture: typeof identity.picture === 'string' ? identity.picture : undefined
    };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ConflictError('That handle is already taken');
    throw error;
  }
}
