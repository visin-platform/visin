import { fetchWithTimeout } from '@visin/backend-core';
import type { Request } from 'express';
import { vi } from 'vitest';
import type { ChatConversation } from '../../models/Conversation';
import { accessCache, checkAccess, groups, peer, publicPerson } from '../../services/access';
vi.mock('@visin/backend-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@visin/backend-core')>()),
  fetchWithTimeout: vi.fn(),
  createGroupServiceClient: () => ({ checkMembership: vi.fn(), getMyGroups: vi.fn() })
}));
vi.mock('../../models/Conversation', () => ({ Conversation: { findOne: vi.fn() } }));
const fetchPeer = vi.mocked(fetchWithTimeout);
const req = {
  user: { id: 'alice' },
  headers: { cookie: 'session=cookie', authorization: 'Bearer token' }
} as unknown as Request;
const environment = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  process.env.AUTH_SERVICE_URL = 'https://auth.example.test/';
  process.env.VISION_SERVICE_URL = 'https://vision.example.test/';
});
afterAll(() => {
  process.env = environment;
});
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('upstream access checks', () => {
  it('encodes a public handle and returns only the upstream profile data', async () => {
    const person = { id: 'alice', name: 'Alice', handle: 'alice' };
    fetchPeer.mockResolvedValue(response({ data: person }));
    await expect(publicPerson('alice/member')).resolves.toEqual(person);
    expect(fetchPeer).toHaveBeenCalledWith('https://auth.example.test/auth/users/alice%2Fmember', {
      timeoutMs: 5000,
      serviceName: 'auth-service'
    });
  });
  it.each([
    [404, 'Public profile not found'],
    [500, 'Could not look up this profile']
  ])('handles profile lookup status %i', async (status, message) => {
    fetchPeer.mockResolvedValue(response({}, status));
    await expect(publicPerson('alice')).rejects.toThrow(message);
  });
  it.each([401, 403, 404])('hides resource existence when upstream returns %i', async (status) => {
    fetchPeer.mockResolvedValue(response({}, status));
    await expect(peer('VISION', '/api/projects/p1', req)).rejects.toThrow('Resource unavailable');
  });
  it('distinguishes an upstream failure from an access denial', async () => {
    fetchPeer.mockResolvedValue(response({}, 503));
    await expect(peer('VISION', '/api/projects/p1', req)).rejects.toThrow('Could not verify resource access');
    expect(fetchPeer).toHaveBeenCalledWith(
      'https://vision.example.test/api/projects/p1',
      expect.objectContaining({ headers: req.headers })
    );
  });
  it('reuses project lookups and the already verified group roster within one request', async () => {
    const conversation = {
      kind: 'project',
      createdBy: 'alice',
      groupId: 'g1',
      projectId: 'p1',
      participants: []
    } as unknown as ChatConversation;
    fetchPeer.mockResolvedValue(response({ data: { _id: 'p1', owner: { kind: 'group', id: 'g1' } } }));
    const cache = accessCache(['g1']);
    await expect(checkAccess(req, conversation, false, cache)).resolves.toBe(conversation);
    await expect(checkAccess(req, conversation, false, cache)).resolves.toBe(conversation);
    expect(fetchPeer).toHaveBeenCalledTimes(1);
    expect(groups.checkMembership).not.toHaveBeenCalled();
  });
  it('denies a project discussion after the owning group changes', async () => {
    const conversation = {
      kind: 'project',
      createdBy: 'alice',
      groupId: 'g1',
      projectId: 'p1',
      participants: []
    } as unknown as ChatConversation;
    vi.mocked(groups.checkMembership).mockResolvedValue({ member: true, role: 'member' });
    fetchPeer.mockResolvedValue(response({ data: { _id: 'p1', owner: { kind: 'group', id: 'g2' } } }));
    await expect(checkAccess(req, conversation)).rejects.toThrow(
      'Project discussion is unavailable after an ownership change'
    );
  });
});
