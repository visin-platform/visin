import { vi } from 'vitest';
import { checkMembership } from '../../clients/groupServiceClient';

// The client itself is backend-core's, tested there; this checks the wiring.
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROUP_SERVICE_URL = 'http://groups.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

it('calls group-service as label-service', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ member: true, role: 'admin' }) });

  expect(await checkMembership('g1', 'user@x.com')).toEqual({ member: true, role: 'admin' });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://groups.test/api/groups/g1/membership?userId=user%40x.com',
    expect.objectContaining({ headers: { 'x-internal-token': 'internal-token', 'x-service-id': 'label-service' } })
  );
});
