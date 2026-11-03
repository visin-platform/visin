import { vi } from 'vitest';
import { Types } from 'mongoose';

/**
 * A stand-in for the Session model in unit tests that exercise session-issuing
 * controllers without a database. `create` echoes the document back with an id,
 * like Mongoose does; the rest default to "nothing matched".
 *
 * Use from a vi.mock factory (which cannot close over imports):
 *   vi.mock('../../models/Session', () => vi.requireActual('../helpers/sessionModelMock').sessionModule());
 */
export const sessionModule = () => ({
  SIGN_IN_METHODS: ['password', 'google', 'unknown'],
  Session: {
    create: vi.fn(async function (doc: Record<string, unknown>) {
      return { _id: new Types.ObjectId(), ...doc };
    }),
    findOne: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
    find: vi.fn(),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
  }
});

/** A live session document as the middleware would attach it. */
export const makeSession = (overrides: Record<string, unknown> = {}) => {
  const now = Date.now();
  return {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    method: 'password',
    createdAt: new Date(now - 60_000),
    lastSeenAt: new Date(now - 60 * 60_000),
    expiresAt: new Date(now + 29 * 86_400_000),
    absoluteExpiresAt: new Date(now + 89 * 86_400_000),
    ...overrides
  };
};
