jest.mock('mongoose', () => ({ ...jest.requireActual('mongoose'), connection: { readyState: 1, collection: jest.fn() } }));
import mongoose from 'mongoose';
import { isCurrentSession, isLegacySessionlessToken, USER_SESSIONS_COLLECTION } from '../../auth/session';

const connection = mongoose.connection as unknown as { readyState: number };
const iat = 1_700_000_000;
const sid = '64b7f1f77bcf86cd79943aaa';
const claims = { id: '507f1f77bcf86cd799439011', email: 'User@Example.test', tokenVersion: 3, sid, iat, exp: iat + 90 * 86400 };
const legacy = { id: claims.id, email: claims.email, tokenVersion: 3, iat, exp: iat + 86400 };
const users = { findOne: jest.fn() };
const sessions = { findOne: jest.fn() };
const options = { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 };
beforeEach(() => {
  connection.readyState = 1;
  jest.spyOn(mongoose.connection, 'collection').mockImplementation(
    (name: string) => (name === 'users' ? users : sessions) as unknown as mongoose.Collection
  );
  users.findOne.mockReset().mockResolvedValue({ _id: new mongoose.Types.ObjectId(claims.id) });
  sessions.findOne.mockReset().mockResolvedValue({ _id: new mongoose.Types.ObjectId(sid) });
});
afterEach(() => jest.restoreAllMocks());

it('checks the account identity/version and the unexpired session on the primary, reading ids only', async () => {
  expect(await isCurrentSession(claims)).toBe(true);
  expect(users.findOne).toHaveBeenCalledWith(
    { _id: new mongoose.Types.ObjectId(claims.id), email: 'user@example.test', tokenVersion: 3 },
    options
  );
  expect(mongoose.connection.collection).toHaveBeenCalledWith(USER_SESSIONS_COLLECTION);
  expect(sessions.findOne).toHaveBeenCalledWith(
    { _id: new mongoose.Types.ObjectId(sid), userId: new mongoose.Types.ObjectId(claims.id), expiresAt: { $gt: expect.any(Date) } },
    options
  );
});

it('rejects a token whose session was revoked or has expired', async () => {
  sessions.findOne.mockResolvedValue(null);
  expect(await isCurrentSession(claims)).toBe(false);
});

it('rejects a live session on an account whose version moved on', async () => {
  users.findOne.mockResolvedValue(null);
  expect(await isCurrentSession(claims)).toBe(false);
});

it('accepts a pre-sessions 24-hour token on the account check alone', async () => {
  expect(await isCurrentSession(legacy)).toBe(true);
  expect(sessions.findOne).not.toHaveBeenCalled();
});

it.each([null, undefined, 'jwt-string', {}, { ...claims, id: '' }, { ...claims, id: 'wrong' },
  { ...claims, email: '' }, { ...claims, email: undefined },
  { ...claims, sid: '' }, { ...claims, sid: 'not-an-id' }, { ...claims, sid: 42 },
  // Session-less but not a legacy token: no lifetime, or longer than the old 24 hours.
  { ...legacy, exp: undefined }, { ...legacy, iat: undefined }, { ...legacy, exp: iat + 86401 },
  ...[undefined, null, '3', 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1].map(tokenVersion => ({ ...claims, tokenVersion }))
])('rejects malformed, versionless or session-less claims before any query: %j', async value => {
  expect(await isCurrentSession(value)).toBe(false);
  expect(users.findOne).not.toHaveBeenCalled();
  expect(sessions.findOne).not.toHaveBeenCalled();
});

it('does not buffer authentication while disconnected', async () => {
  connection.readyState = 0;
  expect(await isCurrentSession(claims)).toBe(false);
  expect(users.findOne).not.toHaveBeenCalled();
});

it('never reuses a previous successful check', async () => {
  expect(await isCurrentSession(claims)).toBe(true);
  sessions.findOne.mockResolvedValue(null);
  expect(await isCurrentSession(claims)).toBe(false);
  expect(sessions.findOne).toHaveBeenCalledTimes(2);
});

it('propagates database failures to the fail-closed middleware', async () => {
  sessions.findOne.mockRejectedValue(new Error('database unavailable'));
  await expect(isCurrentSession(claims)).rejects.toThrow('database unavailable');
});

describe('isLegacySessionlessToken', () => {
  it.each([
    [legacy, true],
    [{ ...legacy, exp: iat + 3600 }, true],
    [claims, false],
    [{ ...legacy, exp: iat + 86401 }, false],
    [{ ...legacy, exp: undefined }, false],
    [null, false],
    ['token', false]
  ])('%j → %s', (value, expected) => {
    expect(isLegacySessionlessToken(value)).toBe(expected);
  });
});
