import { checkMembership, getMyGroups } from '../../clients/groupServiceClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GROUP_SERVICE_URL = 'http://groups.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';
});

describe('checkMembership', () => {
  it('calls the membership endpoint with the internal token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, member: true, role: 'admin' }));

    const result = await checkMembership('g1', 'user@x.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://groups.test/api/groups/g1/membership?userEmail=user%40x.com',
      { headers: { 'x-internal-token': 'internal-token', 'x-service-id': 'label-service' } }
    );
    expect(result).toEqual({ member: true, role: 'admin' });
  });

  it('treats a missing group as non-membership', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    expect(await checkMembership('gone', 'user@x.com')).toEqual({ member: false, role: null });
  });

  it('throws on other failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(checkMembership('g1', 'user@x.com')).rejects.toThrow('membership check failed (500)');
  });
});

describe('getMyGroups', () => {
  it('maps groups to ids + my role', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          { _id: 'g1', members: [{ email: 'user@x.com', role: 'owner' }] },
          { _id: 'g2', members: [{ email: 'other@x.com', role: 'owner' }, { email: 'user@x.com', role: 'member' }] },
        ],
      })
    );

    expect(await getMyGroups('User@X.com')).toEqual([
      { groupId: 'g1', role: 'owner' },
      { groupId: 'g2', role: 'member' },
    ]);
  });

  it('throws on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 502));

    await expect(getMyGroups('user@x.com')).rejects.toThrow('group listing failed (502)');
  });
});
