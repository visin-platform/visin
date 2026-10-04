import { randomBytes } from 'node:crypto';
import { ConflictError } from '@visin/backend-core';
import { User, type IUser } from '../models/User';

/** 3 to 30 characters: lowercase letters, digits and single hyphens inside. */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/;

/**
 * Words a handle may not be: the app's own paths and the names an account might be
 * mistaken for. `/u/:handle` is namespaced, so this is about looking official and
 * about never colliding with a path if handles ever move to the root.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'about', 'account', 'admin', 'api', 'assets', 'datasets', 'docs', 'evaluations', 'explore', 'g', 'help',
  'jobs', 'leaderboards', 'login', 'logout', 'me', 'models', 'new', 'null', 'projects', 'register', 'root',
  'search', 'settings', 'signup', 'static', 'suites', 'support', 'system', 'trainings', 'u', 'undefined',
  'visin'
]);

export const isValidHandle = (handle: string): boolean => HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle);

/** Lowercase ASCII words joined by hyphens, from any text (accents dropped, anything else a break). */
export const slugify = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** What a nameless account is called until its owner picks something: never handed out bare, only with a tail. */
const PLACEHOLDER = 'user';

/**
 * The handle an account starts with: its name, else a plain word. Never the email, whose
 * local part would otherwise become public at sign-up without anyone choosing it.
 */
export const suggestHandle = ({ firstName, lastName }: Pick<IUser, 'firstName' | 'lastName'>): string => {
  const base = slugify([firstName, lastName].filter(Boolean).join(' ')).slice(0, 23).replace(/-+$/, '');
  return base || PLACEHOLDER;
};

const ATTEMPTS = 8;

/**
 * Gives the account a handle if it has none, and returns its handle. The name-based one
 * if it is free, else the name and a short random tail; the unique index decides races,
 * so a collision just tries the next candidate.
 */
export async function ensureHandle(user: Pick<IUser, '_id' | 'handle' | 'firstName' | 'lastName'>): Promise<string> {
  if (user.handle) return user.handle;
  const base = suggestHandle(user);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const candidate = attempt === 0 && base !== PLACEHOLDER && isValidHandle(base) ? base : `${base}-${randomBytes(3).toString('hex')}`;
    try {
      const updated = await User.findOneAndUpdate(
        { _id: user._id, handle: { $exists: false } },
        { $set: { handle: candidate } },
        { returnDocument: 'after' }
      );
      if (updated) {
        user.handle = candidate;
        return candidate;
      }
      // Another request gave it one first.
      const current = await User.findById(user._id).select('handle');
      if (current?.handle) {
        user.handle = current.handle;
        return current.handle;
      }
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  throw new ConflictError('Could not choose a handle; try again');
}
