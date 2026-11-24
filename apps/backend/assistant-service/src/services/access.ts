import {
  BadGatewayError,
  ForbiddenError,
  NotFoundError,
  createGroupServiceClient,
  fetchWithTimeout,
  requireEnv
} from '@visin/backend-core';
import type { Request } from 'express';
import { Conversation, type ChatConversation } from '../models/ChatConversation';

/**
 * Who may read a conversation, as Vivi checks it. This is chat's own rule (`services/access.ts` there), kept in step by
 * hand, because Vivi stands on it for every request about a conversation: the same members, the same group and
 * project checks, the same history boundary. What chat does besides (repairing old bot threads) is not here.
 */

/** A conversation that still exists for people. */
const liveConversation = { deletedAt: null, $nor: [{ kind: 'assistant' as const, bindingKey: null }] };

export const groups = createGroupServiceClient('assistant-service');
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
  const conversation = await Conversation.findOne({ _id: id, ...liveConversation });
  if (!conversation) throw new NotFoundError('Conversation not found');
  return checkAccess(req, conversation, write);
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
