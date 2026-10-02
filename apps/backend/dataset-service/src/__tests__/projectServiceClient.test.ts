jest.mock('@visin/backend-core', () => ({ ...jest.requireActual('@visin/backend-core'), fetchWithTimeout: jest.fn() }));
import { fetchWithTimeout } from '@visin/backend-core';
import { projectDatasetOwner } from '../clients/projectServiceClient';
const fetcher = jest.mocked(fetchWithTimeout);
const saved = { url: process.env.VISION_SERVICE_URL, token: process.env.INTERNAL_SERVICE_TOKEN, mode: process.env.NODE_ENV };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.VISION_SERVICE_URL = 'https://vision.example.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal';
});
afterAll(() => {
  for (const [key, value] of Object.entries({ VISION_SERVICE_URL: saved.url, INTERNAL_SERVICE_TOKEN: saved.token, NODE_ENV: saved.mode })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const reply = (status: number, data?: unknown) => fetcher.mockResolvedValue({ status, ok: status === 200, json: async () => ({ data }) } as Response);

it('reads the live owner after verifying current contribution permission', async () => {
  reply(200, { canWrite: true, owner: { kind: 'group', id: 'group' } });
  expect(await projectDatasetOwner('p', 'u')).toEqual({ kind: 'group', id: 'group' });
});
it.each([404, 500])('rejects a project lookup with status %s', async status => {
  reply(status);
  await expect(projectDatasetOwner('p', 'u')).rejects.toMatchObject({ statusCode: status === 404 ? 403 : 502 });
});
it.each([undefined, { canWrite: false }, { canWrite: true }, { canWrite: true, owner: { kind: 'other', id: 'x' } }, { canWrite: true, owner: { kind: 'user', id: 1 } }])('fails closed on a missing permission or owner %p', async data => {
  reply(200, data);
  await expect(projectDatasetOwner('p', 'u')).rejects.toThrow();
});
it('has no production fallback and uses the local dev service explicitly', async () => {
  delete process.env.VISION_SERVICE_URL;
  process.env.NODE_ENV = 'production';
  await expect(projectDatasetOwner('p', 'u')).rejects.toThrow('VISION_SERVICE_URL');
  process.env.NODE_ENV = 'test';
  reply(200, { canWrite: true, owner: { kind: 'user', id: 'u' } });
  await projectDatasetOwner('p', 'u');
  expect(fetcher.mock.calls[0][0]).toBe('http://localhost:4010/internal/projects/p/key-access?userId=u');
});
