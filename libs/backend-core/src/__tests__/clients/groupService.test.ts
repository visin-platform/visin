import { createGroupServiceClient } from '../../clients/groupService';

const { checkMembership, getMyGroups } = createGroupServiceClient('test-service');

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
      'http://groups.test/api/groups/g1/membership?userId=user%40x.com',
      expect.objectContaining({
        headers: { 'x-internal-token': 'internal-token', 'x-service-id': 'test-service' },
        // A stalled group-service must not hang the caller (fetchWithTimeout).
        signal: expect.any(AbortSignal),
      })
    );
    expect(result).toEqual({ member: true, role: 'admin' });
  });

  it('treats a missing group as non-membership', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));

    expect(await checkMembership('gone', 'user@x.com')).toEqual({ member: false, role: null });
  });

  it('throws on other failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(checkMembership('g1', 'user@x.com')).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('membership check failed (500)')
    });
  });
});

describe('getMyGroups', () => {
  it('maps groups to ids + my role', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          { _id: 'g1', name: 'Team A', members: [{ userId: 'user@x.com', role: 'owner' }] },
          {
            _id: 'g2',
            name: 'Team B',
            members: [{ userId: 'other@x.com', role: 'owner' }, { userId: 'user@x.com', role: 'member' }],
          },
        ],
      })
    );

    expect(await getMyGroups('user@x.com')).toEqual([
      { groupId: 'g1', name: 'Team A', role: 'owner' },
      { groupId: 'g2', name: 'Team B', role: 'member' },
    ]);
  });

  it('throws on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 502));

    await expect(getMyGroups('user@x.com')).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('group listing failed (502)')
    });
  });
});

describe('where group-service is', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('falls back to the host-side dev port outside production', async () => {
    delete process.env.GROUP_SERVICE_URL;
    process.env.NODE_ENV = 'development';
    fetchMock.mockResolvedValue(jsonResponse({ success: true, member: false }));

    await checkMembership('g1', 'user@x.com');

    expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/localhost:5006\//);
  });

  it('has no fallback in production, so a missing setting fails loudly', async () => {
    delete process.env.GROUP_SERVICE_URL;
    process.env.NODE_ENV = 'production';

    await expect(checkMembership('g1', 'user@x.com')).rejects.toThrow('GROUP_SERVICE_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getMyGroups edge cases', () => {
  it('returns nothing when the response carries no data, and defaults a missing role to member', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
    expect(await getMyGroups('user@x.com')).toEqual([]);

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: [{ _id: 'g1', name: 'Team A', members: [] }] }));
    expect(await getMyGroups('user@x.com')).toEqual([{ groupId: 'g1', name: 'Team A', role: 'member' }]);
  });
});
