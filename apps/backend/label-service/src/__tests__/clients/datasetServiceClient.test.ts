import * as datasets from '../../clients/datasetServiceClient';
import { BadGatewayError, NotFoundError } from '@visin/backend-core';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const jsonResponse = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) }) as Response;
const url = (index = 0) => String(fetchMock.mock.calls[index][0]);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATASET_SERVICE_URL = 'http://dataset-service:5010/';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

it('identifies itself with the internal token on every call', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ _id: 'd1', name: 'VLM' }));

  await datasets.getDataset('d1');

  expect(url()).toBe('http://dataset-service:5010/internal/datasets/d1');
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    method: 'GET',
    headers: { 'x-internal-token': 'internal-token', 'x-service-id': 'label-service' }
  });
});

it('reads every page of items, following the keyset cursor', async () => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ items: [{ _id: 'a', path: 'frames/a.png' }], next: 'frames/a.png' }))
    .mockResolvedValueOnce(jsonResponse({ items: [{ _id: 'b', path: 'frames/b.png' }], next: null }));

  const items = await datasets.listItems('d1', { group: 'frames', kind: 'image', noVariant: true });

  expect(items.map((item) => item._id)).toEqual(['a', 'b']);
  expect(url(0)).toContain('group=frames&kind=image&noVariant=true&limit=2000');
  expect(url(1)).toContain('after=frames%2Fa.png');
});

it('passes a variant through, and asks for mask fields and the manifest', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ items: [], next: null }));
  await datasets.listItems('d1', { group: 'verify', kind: 'json', variant: 'masks' });
  expect(url()).toContain('variant=masks');
  expect(url()).not.toContain('noVariant');

  fetchMock.mockResolvedValue(jsonResponse([{ field: 'stratum', values: [] }]));
  expect(await datasets.jsonFields('d1', 'verify', 'masks')).toHaveLength(1);
  expect(url(1)).toBe('http://dataset-service:5010/internal/datasets/d1/json-fields?group=verify&variant=masks');

  fetchMock.mockResolvedValue(jsonResponse([{ stem: 'a', attributes: { stratum: 'day' } }]));
  expect(await datasets.getManifest('d1')).toEqual([{ stem: 'a', attributes: { stratum: 'day' } }]);
});

it('lists what one user may read', async () => {
  fetchMock.mockResolvedValue(jsonResponse([{ _id: 'd1', name: 'VLM' }]));

  await datasets.listDatasetsFor('u1');

  expect(url()).toBe('http://dataset-service:5010/internal/datasets?userId=u1');
});

it('claims and releases a dataset for a job, escaping both ids', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);

  await datasets.addHold('d1', 'j/1');
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT' });
  expect(url()).toBe('http://dataset-service:5010/internal/datasets/d1/holds/label-service/j%2F1');

  await datasets.removeHold('d1', 'j1');
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
});

it('reports a missing dataset as such, and any other failure as an upstream error', async () => {
  fetchMock.mockResolvedValue(jsonResponse(null, 404));
  await expect(datasets.getDataset('gone')).rejects.toBeInstanceOf(NotFoundError);

  fetchMock.mockResolvedValue(jsonResponse(null, 503));
  await expect(datasets.getDataset('d1')).rejects.toBeInstanceOf(BadGatewayError);
});
