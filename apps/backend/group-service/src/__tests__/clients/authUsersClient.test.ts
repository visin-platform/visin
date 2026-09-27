import { GatewayTimeoutError } from '@visin/backend-core';
import { searchUsers } from '../../clients/authUsersClient';
import { maskEmail } from '../../services/groupService';

const fetchMock = jest.fn();
const saved = { url: process.env.AUTH_SERVICE_URL, internal: process.env.INTERNAL_SERVICE_TOKEN, env: process.env.NODE_ENV, fetch: global.fetch };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.AUTH_SERVICE_URL = 'http://auth.test/';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

afterAll(() => {
  global.fetch = saved.fetch;
  for (const [key, value] of [['AUTH_SERVICE_URL', saved.url], ['INTERNAL_SERVICE_TOKEN', saved.internal], ['NODE_ENV', saved.env]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const answer = (status: number, body: unknown = {}) => fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

it('asks auth-service as group-service', async () => {
  answer(200, { data: [{ id: 'u1', email: 'a@example.test' }] });
  await expect(searchUsers('mari tamm', 25)).resolves.toEqual([{ id: 'u1', email: 'a@example.test' }]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://auth.test/auth/internal/users/search?q=mari%20tamm&limit=25');
  expect(init.headers).toMatchObject({ 'x-internal-token': 'internal-token', 'x-service-id': 'group-service' });
});

it("reports auth-service's failures as a bad gateway, keeping a timeout a timeout", async () => {
  answer(500);
  await expect(searchUsers('mari', 25)).rejects.toMatchObject({ statusCode: 502 });
  answer(200, {});
  await expect(searchUsers('mari', 25)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('unexpected') });
  fetchMock.mockRejectedValue(new TypeError('fetch failed'));
  await expect(searchUsers('mari', 25)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('unreachable') });
  fetchMock.mockRejectedValue(new GatewayTimeoutError('auth-service did not answer'));
  await expect(searchUsers('mari', 25)).rejects.toBeInstanceOf(GatewayTimeoutError);
});

it('falls back to the local dev port outside production, and to nothing in production', async () => {
  delete process.env.AUTH_SERVICE_URL;
  answer(200, { data: [] });
  process.env.NODE_ENV = 'development';
  await searchUsers('mari', 25);
  expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/localhost:5001\/auth\//);
  process.env.NODE_ENV = 'production';
  await expect(searchUsers('mari', 25)).rejects.toThrow('AUTH_SERVICE_URL');
});

it('masks an address down to its first letter and domain', () => {
  expect(maskEmail('mari.tamm@taltech.ee')).toBe('m••••@taltech.ee');
  expect(maskEmail('not-an-address')).toBe('••••');
});
