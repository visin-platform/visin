import { fetchWithTimeout } from '@visin/backend-core';
import type { Request } from 'express';
import { vi } from 'vitest';
import type { ChatConversation } from '../../models/ChatConversation';
import { Conversation } from '../../models/ChatConversation';
import { accessCache, authorize, checkAccess, endpoint, groups, historyFilter, peer } from '../../services/access';

/**
 * This service checks who may read a conversation with its own copy of chat's rule. These are chat's cases for it, so the two
 * cannot drift apart unnoticed, and the ones chat's own tests reach through its routes.
 */
vi.mock('@visin/backend-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@visin/backend-core')>()),
  fetchWithTimeout: vi.fn(),
  createGroupServiceClient: () => ({ checkMembership: vi.fn(), getMyGroups: vi.fn() })
}));
vi.mock('../../models/ChatConversation', () => ({ Conversation: { findOne: vi.fn() } }));
const fetchPeer = vi.mocked(fetchWithTimeout);
const req = {
  user: { id: 'alice' },
  headers: { cookie: 'session=cookie', authorization: 'Bearer token' }
} as unknown as Request;
const environment = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  process.env.VISION_SERVICE_URL = 'https://vision.example.test/';
});
afterAll(() => {
  process.env = environment;
});
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const conversation = (extra: Record<string, unknown>) => ({ participants: [], ...extra }) as unknown as ChatConversation;
const member = (userId: string, state = 'active', extra: Record<string, unknown> = {}) => ({
  userId,
  state,
  joinedAt: new Date(),
  joinedSeq: 3,
  ...extra
});

describe("The access check", () => {
  it('reads an internal address before a service address, without a trailing slash', () => {
    process.env.VISION_INTERNAL_URL = 'http://vision:4010/';
    expect(endpoint('VISION')).toBe('http://vision:4010');
    delete process.env.VISION_INTERNAL_URL;
    expect(endpoint('VISION')).toBe('https://vision.example.test');
  });

  it.each([401, 403, 404])('hides a resource from a person who may not read it (%i)', async (status) => {
    fetchPeer.mockResolvedValue(response({}, status));
    await expect(peer('VISION', '/api/projects/p1', req)).rejects.toThrow('Resource unavailable');
  });

  it('tells a failing upstream from a refusal, and forwards the person’s credentials', async () => {
    fetchPeer.mockResolvedValue(response({}, 503));
    await expect(peer('VISION', '/api/projects/p1', req)).rejects.toThrow('Could not verify resource access');
    expect(fetchPeer).toHaveBeenCalledWith(
      'https://vision.example.test/api/projects/p1',
      expect.objectContaining({ headers: { cookie: 'session=cookie', authorization: 'Bearer token' } })
    );
  });

  it('asks about a project once per request, and uses a roster already known', async () => {
    const c = conversation({ kind: 'project', createdBy: 'alice', groupId: 'g1', projectId: 'p1' });
    fetchPeer.mockResolvedValue(response({ data: { _id: 'p1', owner: { kind: 'group', id: 'g1' } } }));
    const cache = accessCache(['g1']);
    await expect(checkAccess(req, c, false, cache)).resolves.toBe(c);
    await expect(checkAccess(req, c, false, cache)).resolves.toBe(c);
    expect(fetchPeer).toHaveBeenCalledTimes(1);
    expect(groups.checkMembership).not.toHaveBeenCalled();
  });

  it('refuses a project discussion after its project changed owner', async () => {
    vi.mocked(groups.checkMembership).mockResolvedValue({ member: true, role: 'member' });
    fetchPeer.mockResolvedValue(response({ data: { _id: 'p1', owner: { kind: 'group', id: 'g2' } } }));
    const c = conversation({ kind: 'project', createdBy: 'alice', groupId: 'g1', projectId: 'p1' });
    await expect(checkAccess(req, c)).rejects.toThrow('Project discussion is unavailable after an ownership change');
    fetchPeer.mockResolvedValue(response({ data: { _id: 'p1', owner: { kind: 'user', id: 'someone-else' } } }));
    await expect(checkAccess(req, conversation({ kind: 'project', createdBy: 'alice', projectId: 'p1' }))).rejects.toThrow(
      'Project discussion is unavailable'
    );
  });

  it('lets a group channel be read by the group’s members only, and a personal one by its creator', async () => {
    vi.mocked(groups.checkMembership).mockResolvedValueOnce({ member: false, role: null });
    await expect(checkAccess(req, conversation({ kind: 'group', groupId: 'g1', createdBy: 'bob' }))).rejects.toThrow(
      'Conversation not found'
    );
    vi.mocked(groups.checkMembership).mockResolvedValueOnce({ member: true, role: 'member' });
    await expect(checkAccess(req, conversation({ kind: 'group', groupId: 'g1', createdBy: 'bob' }))).resolves.toBeTruthy();
    await expect(checkAccess(req, conversation({ kind: 'group', createdBy: 'bob' }))).rejects.toThrow(
      'Conversation not found'
    );
    await expect(checkAccess(req, conversation({ kind: 'group', createdBy: 'alice' }))).resolves.toBeTruthy();
  });

  it('lets people read their own conversations only while they are in them', async () => {
    const some = (state: string) => conversation({ kind: 'room', participants: [member('alice', state)] });
    await expect(checkAccess(req, conversation({ kind: 'room', participants: [member('bob')] }))).rejects.toThrow(
      'Conversation not found'
    );
    for (const state of ['left', 'blocked'])
      await expect(checkAccess(req, some(state))).rejects.toThrow('Conversation not found');
    await expect(checkAccess(req, some('active'))).resolves.toBeTruthy();
    // An invited person reads, but cannot write until they accept.
    await expect(checkAccess(req, some('invited'))).resolves.toBeTruthy();
    await expect(checkAccess(req, some('invited'), true)).rejects.toThrow('Accept the invitation first');
  });

  it('closes a direct chat once either person has left or blocked', async () => {
    const direct = (other: string) =>
      conversation({ kind: 'direct', participants: [member('alice'), member('bob', other)] });
    await expect(checkAccess(req, direct('active'))).resolves.toBeTruthy();
    for (const state of ['left', 'blocked'])
      await expect(checkAccess(req, direct(state))).rejects.toThrow('This conversation is closed');
  });

  it('finds a live conversation and checks it, or says it is not there', async () => {
    vi.mocked(Conversation.findOne).mockResolvedValueOnce(null as never);
    await expect(authorize(req, 'c1')).rejects.toThrow('Conversation not found');
    const found = conversation({ kind: 'room', participants: [member('alice')] });
    vi.mocked(Conversation.findOne).mockResolvedValueOnce(found as never);
    await expect(authorize(req, 'c1', true)).resolves.toBe(found);
    expect(Conversation.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ _id: 'c1', deletedAt: null }));
  });

  it('hides what was said before a person joined a room, and applies no boundary elsewhere', () => {
    const room = (state: string, joinedAt: Date | null) =>
      conversation({ kind: 'room', participants: [member('alice', state, { joinedAt })] });
    expect(historyFilter(room('active', new Date()), 'alice')).toEqual({ seq: { $gt: 3 } });
    expect(historyFilter(room('invited', new Date()), 'alice')).toEqual({ seq: -1 });
    expect(historyFilter(room('active', null), 'alice')).toEqual({ seq: -1 });
    expect(historyFilter(conversation({ kind: 'direct' }), 'alice')).toEqual({});
  });
});
