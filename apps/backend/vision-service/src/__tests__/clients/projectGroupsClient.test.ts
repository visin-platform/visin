import type { Request } from 'express';
import { createHmac } from 'crypto';
import { fetchWithTimeout } from '@visin/backend-core';
import { getUserGroups } from '../../clients/projectGroupsClient';
import { identityContextMiddleware, requestIdentityContext } from '../../middleware/requestIdentityContext';

jest.mock('@visin/backend-core', () => ({ ...jest.requireActual('@visin/backend-core'), fetchWithTimeout: jest.fn() }));
const fetchMock = jest.mocked(fetchWithTimeout);
const user = { id: 'u1', email: 'user@example.test' };
const group = { id: 'a'.repeat(24), name: 'Research' };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const inRequest = <T>(callback: () => T, identity = user) => requestIdentityContext.run({ request: { user: identity } as Request }, callback);
const previous = { secret: process.env.JWT_SECRET, nodeEnv: process.env.NODE_ENV };

beforeEach(() => { jest.resetAllMocks(); process.env.JWT_SECRET = 'test-secret'; process.env.NODE_ENV = 'test'; fetchMock.mockResolvedValue(response({ data: [group] })); });
afterAll(() => {
  if (previous.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous.secret;
  if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
});

it('requires the service actor to match the authenticated request identity', async () => {
  expect(await getUserGroups('u1')).toEqual([]);
  await inRequest(async () => {
    expect(await getUserGroups()).toEqual([]);
    expect(await getUserGroups('u2')).toEqual([]);
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('signs only the verified identity and caches membership only within a request', async () => {
  await inRequest(async () => {
    expect(await getUserGroups('u1')).toEqual([group]);
    expect(await getUserGroups('u1')).toEqual([group]);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('http://localhost:5006/api/internal/project-groups');
  const body = JSON.parse(options!.body as string);
  expect(body).toEqual({ userId: 'u1', issuedAt: expect.any(Number), signature: expect.any(String) });
  expect(body.signature).toBe(createHmac('sha256', 'test-secret').update(JSON.stringify(['vision-project-groups', 'u1', body.issuedAt])).digest('hex'));
  await inRequest(() => getUserGroups('u1'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('uses the accepted production endpoint without additional configuration', async () => {
  process.env.NODE_ENV = 'production';
  await inRequest(() => getUserGroups('u1'));
  expect(fetchMock.mock.calls[0][0]).toBe('https://group-api.visin.eu/api/internal/project-groups');
});
it.each([null, 'invalid', {}, { data: null }, { data: [null] }, { data: [{ id: 'invalid', name: 'Group' }] }, { data: [{ id: group.id, name: 2 }] }])('fails closed on malformed responses (%j)', async body => {
  fetchMock.mockResolvedValue(response(body));
  await expect(inRequest(() => getUserGroups('u1'))).rejects.toThrow('Invalid group membership response');
});
it('fails closed on rejected membership requests', async () => {
  fetchMock.mockResolvedValue(response({}, false));
  await expect(inRequest(() => getUserGroups('u1'))).rejects.toThrow('Could not verify');
});
it('holds the request until downstream authentication populates its identity', async () => {
  const request = {} as Request;
  const next = jest.fn(() => {
    request.user = user;
    expect(requestIdentityContext.getStore()?.request.user).toEqual(user);
  });
  identityContextMiddleware(request, {} as Parameters<typeof identityContextMiddleware>[1], next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(requestIdentityContext.getStore()).toBeUndefined();
});

it('accepts an ID-only identity without using email as authority', async () => {
  await inRequest(async () => { expect(await getUserGroups('u1')).toHaveLength(1); }, { id: 'u1', email: '' });
});
