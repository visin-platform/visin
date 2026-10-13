import { fetchWithTimeout } from '@visin/backend-core';
import { fetchDatasetCovers } from '../../clients/datasetCoversClient';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
const fetchMock = jest.mocked(fetchWithTimeout);
const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;
const previous = { token: process.env.INTERNAL_SERVICE_TOKEN, url: process.env.DATASET_SERVICE_URL, env: process.env.NODE_ENV };

beforeEach(() => {
  jest.resetAllMocks();
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-test-token';
  process.env.NODE_ENV = 'test';
  delete process.env.DATASET_SERVICE_URL;
});
afterAll(() => {
  for (const [key, value] of [['INTERNAL_SERVICE_TOKEN', previous.token], ['DATASET_SERVICE_URL', previous.url], ['NODE_ENV', previous.env]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('fetchDatasetCovers', () => {
  it('asks dataset-service for the covers a reader may see, as that reader', async () => {
    fetchMock.mockResolvedValue(reply({ data: { d1: 'https://files.example.test/d1.jpg' } }));

    expect(await fetchDatasetCovers(['d1', 'd2'], 'u1')).toEqual({ d1: 'https://files.example.test/d1.jpg' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:5010/internal/datasets/covers');
    expect(JSON.parse(options!.body as string)).toEqual({ ids: ['d1', 'd2'], userId: 'u1' });
    expect((options!.headers as Record<string, string>)['X-Internal-Token']).toBe('internal-test-token');
  });

  it('asks as anyone when there is no reader, and sends nothing for no datasets', async () => {
    fetchMock.mockResolvedValue(reply({ data: {} }));

    await fetchDatasetCovers(['d1'], undefined);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ ids: ['d1'] });

    fetchMock.mockClear();
    expect(await fetchDatasetCovers([], 'u1')).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads every requested cover in batches of at most a hundred', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `d${index}`);
    const covers = Object.fromEntries(ids.map((id) => [id, `https://files.example.test/${id}.jpg`]));
    fetchMock.mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string) as { ids: string[]; userId: string };
      expect(body.userId).toBe('u1');
      return reply({ data: Object.fromEntries(body.ids.map((id) => [id, covers[id]])) });
    });

    expect(await fetchDatasetCovers(ids, 'u1')).toEqual(covers);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options!.body as string).ids.length)).toEqual([100, 100, 50]);
  });

  it('keeps successful batches when another batch fails', async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `d${index}`);
    fetchMock
      .mockResolvedValueOnce(reply({ data: { d0: 'https://files.example.test/first.jpg' } }))
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValueOnce(reply({ data: { d200: 'https://files.example.test/last.jpg' } }));

    expect(await fetchDatasetCovers(ids, 'u1')).toEqual({
      d0: 'https://files.example.test/first.jpg',
      d200: 'https://files.example.test/last.jpg'
    });
  });

  it('answers none rather than failing a project list when the service is unwell', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, false, 502));
    expect(await fetchDatasetCovers(['d1'], 'u1')).toEqual({});

    fetchMock.mockRejectedValueOnce(new Error('timed out'));
    expect(await fetchDatasetCovers(['d1'], 'u1')).toEqual({});

    fetchMock.mockResolvedValueOnce(reply({}));
    expect(await fetchDatasetCovers(['d1'], 'u1')).toEqual({});
  });

  it('asks for the service address in production rather than assuming one', async () => {
    process.env.NODE_ENV = 'production';

    // A missing address is a misconfiguration, but still not worth failing a list for.
    expect(await fetchDatasetCovers(['d1'], 'u1')).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
