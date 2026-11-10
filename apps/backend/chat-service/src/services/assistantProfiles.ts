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

type ProfileInput = z.infer<typeof profileInput>;
type AssistantDoc = NonNullable<Awaited<ReturnType<typeof Assistant.findOne>>>;

/** A bot uses the same unique handle namespace and public directory as humans, with no login credentials. */
export async function saveAssistantProfile(userId: string, assistantId: string, body: unknown) {
  const input = parsed(profileInput, body);
  if (RESERVED.has(input.handle)) throw new BadRequestError('Choose another handle');
  const assistant = await Assistant.findOne({ _id: assistantId, ...managedAssistant(userId) });
  if (!assistant) throw new NotFoundError('Assistant not found');
  return writeProfile(assistant, input, managedAssistant(userId));
}

/**
 * Writes a bot's public identity (handle, bio, whether its page is public) and links it to the assistant. `stillAllowed`
 * is re-checked on the assistant as the link is written, so authority lost in between leaves the page unpublished.
 */
async function writeProfile(assistant: AssistantDoc, input: ProfileInput, stillAllowed: Record<string, unknown>) {
  const assistantId = assistant.id as string;
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
      { _id: assistant.id, ...stillAllowed },
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

const platformProfileInput = profileInput.extend({ name: z.string().trim().min(1).max(60) });

const identityOf = (assistantId: string) =>
  mongoose.connection
    .collection('users')
    .findOne(
      { assistantId, kind: 'assistant' },
      { projection: { handle: 1, bio: 1, profilePublic: 1, picture: 1, firstName: 1 } }
    );

/**
 * The platform's own assistant (Vivi): the one every account starts with and visitors talk to. Administrators manage
 * its name and public page, whoever created it; its research access is still only what each asker has.
 */
export async function getPlatformProfile() {
  const assistant = await Assistant.findOne({ platformDefault: true, deletedAt: null }).select('_id name');
  if (!assistant) throw new NotFoundError('No platform assistant is set up yet');
  const user = await identityOf(assistant.id);
  return {
    assistantId: assistant.id as string,
    name: assistant.name,
    handle: user?.handle ? String(user.handle) : '',
    bio: String(user?.bio || ''),
    public: user?.profilePublic === true,
    ...(user ? { userId: user._id.toString() } : {}),
    ...(typeof user?.picture === 'string' ? { picture: user.picture } : {})
  };
}

export async function savePlatformProfile(body: unknown) {
  const { name, ...profile } = parsed(platformProfileInput, body);
  if (RESERVED.has(profile.handle)) throw new BadRequestError('Choose another handle');
  const assistant = await Assistant.findOneAndUpdate(
    { platformDefault: true, deletedAt: null },
    { $set: { name } },
    { returnDocument: 'after', runValidators: true }
  );
  if (!assistant) throw new NotFoundError('No platform assistant is set up yet');
  await writeProfile(assistant, profile, { platformDefault: true, deletedAt: null });
  publicCache = undefined;
  return getPlatformProfile();
}

/** What visitors are shown of the platform assistant: its name and picture, and its page only where that is public. */
export interface PublicAssistant {
  name: string;
  picture?: string;
  handle?: string;
}
let publicCache: { at: number; value: PublicAssistant | null } | undefined;
const PUBLIC_FRESH_MS = 30_000;

/** Asked by every visitor's page, so kept for half a minute; a save here forgets it at once. */
export async function platformAssistantPublic(): Promise<PublicAssistant | null> {
  if (publicCache && Date.now() - publicCache.at < PUBLIC_FRESH_MS) return publicCache.value;
  const assistant = await Assistant.findOne({ platformDefault: true, published: true, paused: false, deletedAt: null })
    .select('_id name')
    .lean();
  const user = assistant ? await identityOf(String(assistant._id)) : null;
  const value: PublicAssistant | null = assistant
    ? {
        name: assistant.name,
        ...(typeof user?.picture === 'string' ? { picture: user.picture } : {}),
        ...(user?.profilePublic === true && user.handle ? { handle: String(user.handle) } : {})
      }
    : null;
  publicCache = { at: Date.now(), value };
  return value;
}

/** Test seam. */
export function forgetPlatformAssistant(): void {
  publicCache = undefined;
}
