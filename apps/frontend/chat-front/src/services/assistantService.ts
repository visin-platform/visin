import type {
  AssistantProfile,
  PublicAssistant,
  Assistant,
  AssistantInput,
  SharedAssistantChange,
  SharedAssistantSettings
} from '../types/assistant';
import { api } from './apiClient';
export const assistantService = {
  default: (signal?: AbortSignal) =>
    api<{ _id: string; name: string } | null>('/assistants/default', undefined, signal),
  profile: (id: string, signal?: AbortSignal) =>
    api<AssistantProfile | null>(`/assistants/${id}/profile`, undefined, signal),
  saveProfile: (id: string, input: { handle: string; bio: string; public: boolean }) =>
    api<AssistantProfile>(`/assistants/${id}/profile`, input),
  catalog: (signal?: AbortSignal) =>
    signal
      ? api<PublicAssistant[]>('/assistants/catalog', undefined, signal)
      : api<PublicAssistant[]>('/assistants/catalog'),
  list: (signal?: AbortSignal) =>
    signal ? api<Assistant[]>('/assistants', undefined, signal) : api<Assistant[]>('/assistants'),
  save: (input: AssistantInput, id?: string) => api<Assistant>(id ? `/assistants/${id}` : '/assistants', input),
  remove: (id: string) => api<void>(`/assistants/${id}/delete`, {}),
  shared: (conversationId: string, signal?: AbortSignal) =>
    api<SharedAssistantSettings>(`/conversations/${conversationId}/assistants`, undefined, signal),
  updateShared: (conversationId: string, change: SharedAssistantChange) =>
    api<SharedAssistantSettings>(`/conversations/${conversationId}/assistants`, change)
};
