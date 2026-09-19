import { Types } from 'mongoose';

/**
 * A stand-in for the Session model in unit tests that exercise session-issuing
 * controllers without a database. `create` echoes the document back with an id,
 * like Mongoose does; the rest default to "nothing matched".
 *
 * Use from a jest.mock factory (which cannot close over imports):
 *   jest.mock('../../models/Session', () => jest.requireActual('../helpers/sessionModelMock').sessionModule());
 */
export const sessionModule = () => ({
  SIGN_IN_METHODS: ['password', 'google', 'unknown'],
  Session: {
    create: jest.fn(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc })),
    findOne: jest.fn().mockResolvedValue(null),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
    find: jest.fn(),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
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
