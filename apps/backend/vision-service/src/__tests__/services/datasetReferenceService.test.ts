jest.mock('@visin/backend-core', () => ({ ...jest.requireActual('@visin/backend-core'), fetchWithTimeout: jest.fn() }));
import { fetchWithTimeout } from '@visin/backend-core';
import { resolveDatasetReference } from '../../services/datasetReferenceService';

const fetcher = jest.mocked(fetchWithTimeout);
const saved = { url: process.env.DATASET_SERVICE_URL, token: process.env.INTERNAL_SERVICE_TOKEN, mode: process.env.NODE_ENV };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATASET_SERVICE_URL = 'https://datasets.example.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-test';
});
afterAll(() => {
  for (const [key, value] of Object.entries({ DATASET_SERVICE_URL: saved.url, INTERNAL_SERVICE_TOKEN: saved.token, NODE_ENV: saved.mode })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const reply = (status: number, data?: unknown) => fetcher.mockResolvedValue({ status, ok: status === 200, json: async () => ({ data }) } as Response);

it('leaves absent and legacy local dataset labels usable', async () => {
  expect(await resolveDatasetReference(undefined, undefined, 'u')).toBeUndefined();
  expect(await resolveDatasetReference(undefined, 'local', 'u')).toEqual({ source: 'other', name: 'local' });
  expect(await resolveDatasetReference({ source: 'hf', name: 'org/repo' }, undefined, 'u')).toEqual({ source: 'hf', name: 'org/repo' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('resolves names to IDs and preserves the archive actually used even after replacement', async () => {
  reply(200, { source: 'visin', id: 'id', name: 'ZOD', revision: 'new' });
  expect(await resolveDatasetReference(undefined, 'visin:zod', 'u')).toEqual({ source: 'visin', id: 'id', name: 'ZOD', revision: 'new' });
  expect(await resolveDatasetReference({ source: 'visin', id: 'id', name: 'zod', revision: 'old' }, undefined, 'u', { kind: 'group', id: 'g' })).toMatchObject({ id: 'id', revision: 'old' });
  expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ reference: 'id', userId: 'u', projectOwner: { kind: 'group', id: 'g' } });
});
it.each([404, 400, 500])('reports a %s resolution failure as an HTTP error', async status => {
  reply(status);
  await expect(resolveDatasetReference({ source: 'visin', name: 'zod' }, undefined, 'u')).rejects.toMatchObject({ statusCode: status === 500 ? 502 : status });
});
it.each([undefined, {}, { source: 'hf', id: 'x', name: 'x' }, { source: 'visin', name: 'x' }, { source: 'visin', id: 'x' }])('rejects an invalid service response %p', async data => {
  reply(200, data);
  await expect(resolveDatasetReference(undefined, 'visin:zod', 'u')).rejects.toMatchObject({ statusCode: 502 });
});
it('requires a configured production address but supports local development', async () => {
  delete process.env.DATASET_SERVICE_URL;
  process.env.NODE_ENV = 'production';
  await expect(resolveDatasetReference(undefined, 'visin:zod', 'u')).rejects.toThrow('DATASET_SERVICE_URL');
  process.env.NODE_ENV = 'test';
  reply(200, { source: 'visin', id: 'id', name: 'ZOD' });
  await resolveDatasetReference(undefined, 'visin:zod', 'u');
  expect(fetcher.mock.calls[0][0]).toBe('http://localhost:5010/internal/datasets/resolve');
});
