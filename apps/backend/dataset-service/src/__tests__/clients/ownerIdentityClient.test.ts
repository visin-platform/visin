import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';

const fetchMock = jest.fn();
const realFetch = global.fetch;
const saved = process.env.AUTH_SERVICE_URL;

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.AUTH_SERVICE_URL = 'http://auth-service:5001';
});
afterEach(() => {
  global.fetch = realFetch;
  fetchMock.mockReset();
  if (saved === undefined) delete process.env.AUTH_SERVICE_URL;
  else process.env.AUTH_SERVICE_URL = saved;
});

it('asks auth-service for the people, identifying itself as dataset-service', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'u1', name: 'Ada' }] }) } as Response);

  const owners = await lookupOwnerIdentities([{ kind: 'user', id: 'u1' }]);

  expect(owners.get('u1')).toEqual({ id: 'u1', name: 'Ada' });
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'x-service-id': 'dataset-service' } });
});
