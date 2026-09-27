import { GatewayTimeoutError } from '@visin/backend-core';
import { ownedByGroup } from '../../clients/ownedResourcesClient';

const fetchMock = jest.fn();
const KEYS = ['VISION_SERVICE_URL', 'DATASET_SERVICE_URL', 'INTERNAL_SERVICE_TOKEN', 'NODE_ENV'] as const;
const saved = { ...Object.fromEntries(KEYS.map((key) => [key, process.env[key]])), fetch: global.fetch };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.VISION_SERVICE_URL = 'http://vision.test/';
  process.env.DATASET_SERVICE_URL = 'http://datasets.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

afterAll(() => {
  global.fetch = saved.fetch;
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

it('asks vision-service and dataset-service, as group-service', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    answer(200, { data: url.startsWith('http://vision.test') ? { count: 2, names: ['A', 'B'] } : { count: 0, names: [] } })
  );
  await expect(ownedByGroup('g 1')).resolves.toEqual({ projects: { count: 2, names: ['A', 'B'] }, datasets: { count: 0, names: [] } });
  const urls = fetchMock.mock.calls.map(([url]) => url).sort();
  expect(urls).toEqual(['http://datasets.test/internal/groups/g%201/owned', 'http://vision.test/internal/groups/g%201/owned']);
  expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'x-internal-token': 'internal-token', 'x-service-id': 'group-service' });
});

it("reports a peer's failures as a bad gateway, keeping a timeout a timeout", async () => {
  fetchMock.mockResolvedValue(answer(500, {}));
  await expect(ownedByGroup('g1')).rejects.toMatchObject({ statusCode: 502 });
  fetchMock.mockResolvedValue(answer(200, { data: { count: 'many' } }));
  await expect(ownedByGroup('g1')).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('unexpected') });
  fetchMock.mockRejectedValue(new TypeError('fetch failed'));
  await expect(ownedByGroup('g1')).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('unreachable') });
  fetchMock.mockRejectedValue(new GatewayTimeoutError('vision-service did not answer'));
  await expect(ownedByGroup('g1')).rejects.toMatchObject({ statusCode: 504 });
});

it('needs the peer addresses in production, and falls back to the dev ports outside it', async () => {
  delete process.env.VISION_SERVICE_URL;
  delete process.env.DATASET_SERVICE_URL;
  process.env.NODE_ENV = 'production';
  await expect(ownedByGroup('g1')).rejects.toThrow('VISION_SERVICE_URL');
  expect(fetchMock).not.toHaveBeenCalled();
  process.env.NODE_ENV = 'development';
  fetchMock.mockResolvedValue(answer(200, { data: { count: 0, names: [] } }));
  await ownedByGroup('g1');
  expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
    'http://localhost:4010/internal/groups/g1/owned',
    'http://localhost:5010/internal/groups/g1/owned'
  ]);
});
