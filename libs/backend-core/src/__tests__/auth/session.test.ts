jest.mock('mongoose', () => ({ ...jest.requireActual('mongoose'), connection: { readyState: 1, collection: jest.fn() } }));
import mongoose from 'mongoose';
import { isCurrentSession } from '../../auth/session';

const connection = mongoose.connection as unknown as { readyState: number };
const claims = { id: '507f1f77bcf86cd799439011', email: 'User@Example.test', tokenVersion: 3 };
const findOne = jest.fn();
beforeEach(() => {
  connection.readyState = 1;
  jest.spyOn(mongoose.connection, 'collection').mockReturnValue({ findOne } as unknown as mongoose.Collection);
  findOne.mockReset().mockResolvedValue({ _id: new mongoose.Types.ObjectId(claims.id) });
});
afterEach(() => jest.restoreAllMocks());

it('uses only the matching account identity/version on the primary, without reading password data', async () => {
  expect(await isCurrentSession(claims)).toBe(true);
  expect(mongoose.connection.collection).toHaveBeenCalledWith('users');
  expect(findOne).toHaveBeenCalledWith(
    { _id: new mongoose.Types.ObjectId(claims.id), email: 'user@example.test', tokenVersion: 3 },
    { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 }
  );
});

it.each([null, undefined, 'jwt-string', {}, { ...claims, id: '' }, { ...claims, id: 'wrong' },
  { ...claims, email: '' }, { ...claims, email: undefined },
  ...[undefined, null, '3', 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1].map(tokenVersion => ({ ...claims, tokenVersion }))
])('rejects malformed or versionless session claims before any query: %j', async value => {
  expect(await isCurrentSession(value)).toBe(false);
  expect(findOne).not.toHaveBeenCalled();
});

it('does not buffer authentication while disconnected', async () => {
  connection.readyState = 0;
  expect(await isCurrentSession(claims)).toBe(false);
  expect(findOne).not.toHaveBeenCalled();
});

it('never reuses a previous successful account check', async () => {
  expect(await isCurrentSession(claims)).toBe(true);
  findOne.mockResolvedValue(null);
  expect(await isCurrentSession(claims)).toBe(false);
  expect(findOne).toHaveBeenCalledTimes(2);
});

it('propagates database failures to the fail-closed middleware', async () => {
  findOne.mockRejectedValue(new Error('database unavailable'));
  await expect(isCurrentSession(claims)).rejects.toThrow('database unavailable');
});
