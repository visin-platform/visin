import { fetchWithTimeout } from '@visin/backend-core';
import { lookupOwners } from '../../clients/authOwnersClient';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
const fetchMock = jest.mocked(fetchWithTimeout);
const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;
const id = (n: number) => n.toString(16).padStart(24, '0');
const saved = { url: process.env.AUTH_SERVICE_URL, token: process.env.INTERNAL_SERVICE_TOKEN };

beforeEach(() => {
  jest.resetAllMocks();
  process.env.AUTH_SERVICE_URL = 'http://auth-service:5001/';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
});
afterAll(() => {
  for (const [key, value] of [['AUTH_SERVICE_URL', saved.url], ['INTERNAL_SERVICE_TOKEN', saved.token]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('lookupOwners', () => {
  it('asks auth-service once, as this service, for the distinct ids', async () => {
    fetchMock.mockResolvedValue(response({ data: [{ id: id(1), handle: 'ann', name: 'Ann Lee', picture: 'https://p.test/a.jpg' }, { id: id(2) }] }));

    const owners = await lookupOwners([id(1), id(2), id(1)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://auth-service:5001/auth/internal/users/public');
    expect(options).toMatchObject({
      method: 'POST',
      headers: { 'x-internal-token': 'internal-secret', 'x-service-id': 'dataset-service' },
      serviceName: 'auth-service'
    });
    expect(JSON.parse(options!.body as string)).toEqual({ ids: [id(1), id(2)] });
    expect(owners.get(id(1))).toEqual({ id: id(1), handle: 'ann', name: 'Ann Lee', picture: 'https://p.test/a.jpg' });
    expect(owners.get(id(2))).toEqual({ id: id(2) });
  });

  it('asks for a hundred at a time', async () => {
    fetchMock.mockResolvedValue(response({ data: [] }));

    await lookupOwners(Array.from({ length: 250 }, (_, index) => id(index + 1)));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options!.body as string).ids.length)).toEqual([100, 100, 50]);
  });

  it('makes no call for nothing, or where auth-service is not configured', async () => {
    expect((await lookupOwners([])).size).toBe(0);
    delete process.env.AUTH_SERVICE_URL;
    expect((await lookupOwners([id(1)])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the list without its owners when auth-service cannot answer', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    expect((await lookupOwners([id(1)])).size).toBe(0);

    fetchMock.mockResolvedValueOnce(response({}, false, 503));
    expect((await lookupOwners([id(1)])).size).toBe(0);

    fetchMock.mockResolvedValueOnce(response({ success: true }));
    expect((await lookupOwners([id(1)])).size).toBe(0);
  });

  it('keeps what an earlier call found when a later one fails', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: [{ id: id(1), handle: 'ann' }] }))
      .mockRejectedValueOnce(new Error('timeout'));

    const owners = await lookupOwners(Array.from({ length: 101 }, (_, index) => id(index + 1)));

    expect([...owners.keys()]).toEqual([id(1)]);
  });

  it('sends an empty token rather than none when the secret is unset', async () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    fetchMock.mockResolvedValue(response({ data: [] }));

    await lookupOwners([id(1)]);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'x-internal-token': '' } });
  });
});
