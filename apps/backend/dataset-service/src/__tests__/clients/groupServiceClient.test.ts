import { checkMembership } from '../../clients/groupServiceClient';

// The client itself is backend-core's, tested there; this checks the wiring.
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GROUP_SERVICE_URL = 'http://groups.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

it('calls group-service as dataset-service', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ member: true, role: 'admin' }) });

  expect(await checkMembership('g1', 'user@x.com')).toEqual({ member: true, role: 'admin' });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://groups.test/api/groups/g1/membership?userId=user%40x.com',
    expect.objectContaining({ headers: { 'x-internal-token': 'internal-token', 'x-service-id': 'dataset-service' } })
  );
});
