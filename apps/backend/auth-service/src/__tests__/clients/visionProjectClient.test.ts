import { GatewayTimeoutError } from '@visin/backend-core';
import { getKeyProject } from '../../clients/visionProjectClient';

const fetchMock = jest.fn();
const saved = { url: process.env.VISION_SERVICE_URL, internal: process.env.INTERNAL_SERVICE_TOKEN, env: process.env.NODE_ENV, fetch: global.fetch };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.VISION_SERVICE_URL = 'http://vision.test/';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

afterAll(() => {
  global.fetch = saved.fetch;
  for (const [key, value] of [['VISION_SERVICE_URL', saved.url], ['INTERNAL_SERVICE_TOKEN', saved.internal], ['NODE_ENV', saved.env]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const answer = (status: number, body: unknown = {}) => fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

it('asks vision-service as auth-service, for the account the key is for', async () => {
  answer(200, { data: { id: 'p1', name: 'Road scenes', canWrite: true } });

  await expect(getKeyProject('p1', 'user 1')).resolves.toEqual({ id: 'p1', name: 'Road scenes', canWrite: true });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://vision.test/internal/projects/p1/key-access?userId=user%201');
  expect(init.headers).toMatchObject({ 'x-internal-token': 'internal-token', 'x-service-id': 'auth-service' });
});

it('answers null for no such project', async () => {
  answer(404);
  await expect(getKeyProject('p1', 'u1')).resolves.toBeNull();
});

it("reports vision-service's failures as a bad gateway, keeping a timeout a timeout", async () => {
  answer(500);
  await expect(getKeyProject('p1', 'u1')).rejects.toMatchObject({ statusCode: 502 });
  answer(200, { data: { id: 'p1' } });
  await expect(getKeyProject('p1', 'u1')).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('unexpected') });
  fetchMock.mockRejectedValue(new TypeError('fetch failed'));
  await expect(getKeyProject('p1', 'u1')).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('unreachable') });
  fetchMock.mockRejectedValue(new GatewayTimeoutError('vision-service did not answer'));
  await expect(getKeyProject('p1', 'u1')).rejects.toBeInstanceOf(GatewayTimeoutError);
});

it('falls back to the local dev port outside production, and to nothing in production', async () => {
  delete process.env.VISION_SERVICE_URL;
  answer(404);
  process.env.NODE_ENV = 'development';
  await getKeyProject('p1', 'u1');
  expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/localhost:4010\/internal\//);

  process.env.NODE_ENV = 'production';
  await expect(getKeyProject('p1', 'u1')).rejects.toThrow('VISION_SERVICE_URL');
});
