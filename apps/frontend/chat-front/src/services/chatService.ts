import type {
  Capabilities,
  ChatContact,
  ChatGroup,
  ChatProject,
  Conversation,
  CreateConversationInput,
  FindingInput,
  Message,
  Run,
  SendMessageInput
} from '../types/chat';

import { api } from './apiClient';
import type { ScreenCall } from '../utils/screen';

const read = <T>(path: string, signal?: AbortSignal) => (signal ? api<T>(path, undefined, signal) : api<T>(path));

/** The browser-session API shared by the full page and federated panel. */
export const chatService = {
  get: (id: string, signal?: AbortSignal) => read<Conversation>(`/conversations/${id}`, signal),
  list: (signal?: AbortSignal) => read<Conversation[]>('/conversations', signal),
  capabilities: (signal?: AbortSignal) => read<Capabilities>('/capabilities', signal),
  groups: (signal?: AbortSignal) => read<ChatGroup[]>('/groups', signal),
  projects: (signal?: AbortSignal) => read<ChatProject[]>('/projects', signal),
  contacts: (signal?: AbortSignal) => read<ChatContact[]>('/contacts', signal),
  create: (input: CreateConversationInput) => api<Conversation>('/conversations', input),
  openGroup: (groupId: string) => api<Conversation>(`/groups/${groupId}/channel`, {}),
  messages: (id: string, signal?: AbortSignal, before?: number) =>
    read<Message[]>(`/conversations/${id}/messages${before === undefined ? '' : `?before=${before}`}`, signal),
  runs: (id: string, signal?: AbortSignal) => read<Run[]>(`/conversations/${id}/runs`, signal),
  send: (id: string, input: SendMessageInput) => api<Message>(`/conversations/${id}/messages`, input),
  markRead: (id: string, seq: number) => api<void>(`/conversations/${id}/read`, { seq }),
  membership: (id: string, action: string) => api<void>(`/conversations/${id}/membership`, { action }),
  invite: (id: string, handle: string) => api<void>(`/conversations/${id}/participants`, { handle }),
  removeParticipant: (id: string, userId: string) => api<void>(`/conversations/${id}/remove-participant`, { userId }),
  cancel: (id: string) => api<void>(`/conversations/${id}/cancel`, {}),
  screenCalls: (id: string, tab: string, signal?: AbortSignal) =>
    read<ScreenCall[]>(`/conversations/${id}/screen-calls?tab=${encodeURIComponent(tab)}`, signal),
  screenResult: (id: string, result: { ok: boolean; summary: string }) =>
    api<void>(`/screen-calls/${id}/result`, result),
  saveFinding: (id: string, input: FindingInput) => api<void>(`/conversations/${id}/findings`, input)
};
