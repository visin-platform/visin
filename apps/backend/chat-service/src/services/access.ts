import {
  BadGatewayError,
  ForbiddenError,
  NotFoundError,
  createGroupServiceClient,
  fetchWithTimeout,
  requireEnv
} from '@visin/backend-core';
import type { Request } from 'express';
import { repairBotDirect } from './botConversations';
import { Conversation, type ChatConversation } from '../models/Conversation';

export const groups = createGroupServiceClient('chat-service');
export function endpoint(service: string): string {
  return (process.env[`${service}_INTERNAL_URL`] || requireEnv(`${service}_SERVICE_URL`)).replace(/\/$/, '');
}
export async function peer<T>(service: string, path: string, req: Request): Promise<T> {
  const response = await fetchWithTimeout(`${endpoint(service)}${path}`, {
    headers: {
      ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
      ...(req.headers.authorization ? { authorization: req.headers.authorization } : {})
    },
    timeoutMs: 10000,
    serviceName: `${service.toLowerCase()}-service`
  });
  if (response.status === 403 || response.status === 404 || response.status === 401)
    throw new NotFoundError('Resource unavailable');
  if (!response.ok) throw new BadGatewayError('Could not verify resource access');
  return ((await response.json()) as { data: T }).data;
}
export interface Project {
  _id: string;
  name: string;
  owner: { kind: 'user' | 'group'; id: string };
}
/**
 * Lookups shared by the access checks of one request, so a list of conversations asks
 * group-service and vision-service once per group and project rather than once per row.
 */
export interface AccessCache {
  /** The caller's current groups, when already fetched; otherwise each group is checked on its own. */
  groupIds?: Set<string>;
  projects: Map<string, Promise<Project>>;
}
export const accessCache = (groupIds?: Iterable<string>): AccessCache => ({
  groupIds: groupIds ? new Set(groupIds) : undefined,
  projects: new Map()
});
export async function authorize(req: Request, id: string, write = false) {
  const conversation = await Conversation.findOne({ _id: id, deletedAt: null });
  if (!conversation) throw new NotFoundError('Conversation not found');
  await checkAccess(req, conversation, write);
  return repairBotDirect(conversation, req.user!.id);
}
/** The checks of `authorize` for a conversation already loaded. Throws NotFound/Forbidden. */
export async function checkAccess<C extends ChatConversation>(
  req: Request,
  conversation: C,
  write = false,
  cache: AccessCache = accessCache()
): Promise<C> {
  const actor = req.user!.id;
  const member = conversation.participants.find((p) => p.userId === actor);
  const isGroupMember = async (groupId: string) =>
    cache.groupIds ? cache.groupIds.has(groupId) : (await groups.checkMembership(groupId, actor)).member;
  const project = (projectId: string) => {
    let pending = cache.projects.get(projectId);
    if (!pending) {
      pending = peer<Project>('VISION', `/api/projects/${projectId}`, req);
      cache.projects.set(projectId, pending);
    }
    return pending;
  };
  if (conversation.kind === 'group' || conversation.kind === 'project') {
    if (conversation.groupId) {
      if (!(await isGroupMember(conversation.groupId))) throw new NotFoundError('Conversation not found');
    } else if (conversation.createdBy !== actor) throw new NotFoundError('Conversation not found');
    if (conversation.projectId) {
      const owner = (await project(conversation.projectId)).owner;
      if (
        owner.kind === 'group'
          ? owner.id !== conversation.groupId
          : owner.id !== conversation.createdBy || Boolean(conversation.groupId)
      )
        throw new NotFoundError('Project discussion is unavailable after an ownership change');
    }
  } else {
    if (!member || member.state === 'left' || member.state === 'blocked')
      throw new NotFoundError('Conversation not found');
    if (write && member.state !== 'active') throw new ForbiddenError('Accept the invitation first');
    if (
      conversation.kind === 'direct' &&
      conversation.participants.some((p) => p.state === 'blocked' || p.state === 'left')
    ) {
      throw new ForbiddenError('This conversation is closed');
    }
  }
  if (conversation.kind === 'assistant' && conversation.projectId) await project(conversation.projectId);
  // A conversation about a paper reads it as the asker may: a paper made private or trashed since stops being readable here.
  if (conversation.kind === 'assistant' && conversation.paperId) {
    const key = `paper:${conversation.paperId}`;
    let pending = cache.projects.get(key);
    if (!pending) {
      pending = peer<Project>('VISION', `/api/papers/${conversation.paperId}`, req);
      cache.projects.set(key, pending);
    }
    await pending;
  }
  return conversation;
}
export function historyFilter(conversation: ChatConversation, userId: string) {
  const participant = conversation.participants.find((p) => p.userId === userId);
  if (conversation.kind === 'room')
    return participant?.state === 'active' && participant.joinedAt
      ? { seq: { $gt: participant.joinedSeq } }
      : { seq: -1 };
  return {};
}
export async function publicPerson(
  handle: string
): Promise<{ id: string; name: string; handle: string; kind?: string; assistantId?: string }> {
  const response = await fetchWithTimeout(`${endpoint('AUTH')}/auth/users/${encodeURIComponent(handle)}`, {
    timeoutMs: 5000,
    serviceName: 'auth-service'
  });
  if (response.status === 404) throw new NotFoundError('Public profile not found');
  if (!response.ok) throw new BadGatewayError('Could not look up this profile');
  return (
    (await response.json()) as {
      data: { id: string; name: string; handle: string; kind?: string; assistantId?: string };
    }
  ).data;
}

/** Only contacts whose roster the current user may already read. Never an account directory. */
export async function sharedContacts(req: Request, groupId?: string): Promise<{ id: string; name: string }[]> {
  const memberships = await groups.getMyGroups(req.user!.id);
  if (groupId && !memberships.some((membership) => membership.groupId === groupId))
    throw new NotFoundError('Only members of this group can view its contacts');
  const contacts = new Map<string, { id: string; name: string }>();
  const rosters = await Promise.all(
    memberships
      .filter((membership) => !groupId || membership.groupId === groupId)
      .slice(0, 20)
      .map((membership) =>
        peer<{ members: { userId: string; email?: string }[] }>('GROUP', `/api/groups/${membership.groupId}`, req)
      )
  );
  for (const group of rosters) {
    for (const member of group.members) {
      if (member.userId !== req.user!.id)
        contacts.set(member.userId, { id: member.userId, name: member.email || `Member ${member.userId.slice(-6)}` });
    }
  }
  return [...contacts.values()].slice(0, 500);
}
