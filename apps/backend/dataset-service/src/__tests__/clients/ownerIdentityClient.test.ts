import { fetchWithTimeout } from '@visin/backend-core';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  fetchWithTimeout: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
const fetchMock = jest.mocked(fetchWithTimeout);
const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;
const id = (n: number) => n.toString(16).padStart(24, '0');
const person = (n: number) => ({ kind: 'user' as const, id: id(n) });
const group = (n: number) => ({ kind: 'group' as const, id: id(n) });
const saved = { auth: process.env.AUTH_SERVICE_URL, group: process.env.GROUP_SERVICE_URL, token: process.env.INTERNAL_SERVICE_TOKEN };

beforeEach(() => {
  jest.resetAllMocks();
  process.env.AUTH_SERVICE_URL = 'http://auth-service:5001/';
  process.env.GROUP_SERVICE_URL = 'http://group-service:5006';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
});
afterAll(() => {
  for (const [key, value] of [['AUTH_SERVICE_URL', saved.auth], ['GROUP_SERVICE_URL', saved.group], ['INTERNAL_SERVICE_TOKEN', saved.token]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('lookupOwnerIdentities', () => {
  it('asks auth-service once, as this service, for the distinct people', async () => {
    fetchMock.mockResolvedValue(response({ data: [{ id: id(1), handle: 'ann', name: 'Ann Lee', picture: 'https://p.test/a.jpg' }, { id: id(2) }] }));

    const owners = await lookupOwnerIdentities([person(1), person(2), person(1)]);

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

  it('asks group-service for the groups, each service only for its own kind', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/auth/')
        ? response({ data: [{ id: id(1), name: 'Ann Lee' }] })
        : response({ data: [{ id: id(9), handle: 'road-lab', name: 'Road lab' }] })
    );

    const owners = await lookupOwnerIdentities([person(1), group(9)]);

    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      'http://auth-service:5001/auth/internal/users/public',
      'http://group-service:5006/api/internal/groups/public'
    ]);
    const groupCall = fetchMock.mock.calls.find(([url]) => String(url).includes('group-service'))!;
    expect(JSON.parse(groupCall[1]!.body as string)).toEqual({ ids: [id(9)] });
    expect(groupCall[1]).toMatchObject({ serviceName: 'group-service' });
    expect(owners.get(id(9))).toEqual({ id: id(9), handle: 'road-lab', name: 'Road lab' });
    expect(owners.get(id(1))).toMatchObject({ name: 'Ann Lee' });
  });

  it('does not ask a service about a kind that is not there', async () => {
    fetchMock.mockResolvedValue(response({ data: [] }));

    await lookupOwnerIdentities([group(9)]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://group-service:5006/api/internal/groups/public']);

    fetchMock.mockClear();
    await lookupOwnerIdentities([person(1)]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://auth-service:5001/auth/internal/users/public']);
  });

  it('asks for a hundred at a time', async () => {
    fetchMock.mockResolvedValue(response({ data: [] }));

    await lookupOwnerIdentities(Array.from({ length: 250 }, (_, index) => person(index + 1)));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options!.body as string).ids.length)).toEqual([100, 100, 50]);
  });

  it('makes no call for nothing, or for a service that is not configured', async () => {
    expect((await lookupOwnerIdentities([])).size).toBe(0);
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.GROUP_SERVICE_URL;
    expect((await lookupOwnerIdentities([person(1), group(2)])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the list without its owners when a service cannot answer', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    expect((await lookupOwnerIdentities([person(1)])).size).toBe(0);

    fetchMock.mockResolvedValueOnce(response({}, false, 503));
    expect((await lookupOwnerIdentities([group(1)])).size).toBe(0);

    fetchMock.mockResolvedValueOnce(response({ success: true }));
    expect((await lookupOwnerIdentities([person(1)])).size).toBe(0);
  });

  it('keeps what one service found when the other fails', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('group-service')) throw new Error('timeout');
      return response({ data: [{ id: id(1), handle: 'ann' }] });
    });

    const owners = await lookupOwnerIdentities([person(1), group(9)]);

    expect([...owners.keys()]).toEqual([id(1)]);
  });

  it('keeps what an earlier batch found when a later one fails', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: [{ id: id(1), handle: 'ann' }] }))
      .mockRejectedValueOnce(new Error('timeout'));

    const owners = await lookupOwnerIdentities(Array.from({ length: 101 }, (_, index) => person(index + 1)));

    expect([...owners.keys()]).toEqual([id(1)]);
  });

  it('sends an empty token rather than none when the secret is unset', async () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    fetchMock.mockResolvedValue(response({ data: [] }));

    await lookupOwnerIdentities([person(1)]);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'x-internal-token': '' } });
  });
});
