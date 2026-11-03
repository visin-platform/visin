import { createApiClient, ApiError } from '@visin/frontend-core';
import { getGlobalConfig } from './config/ConfigProvider';
/** What a page of Vision is about (a run, a comparison, a project), for the analyst. */
export interface PageContext {
  projectId?: string;
  trainingIds?: string[];
  title?: string;
  /** For showing only; the conversation is named from the project itself. */
  projectName?: string;
}
/** A deliberate request to open chat on something: an analysis, a project discussion, a person, a group. */
export type OpenRequest =
  | (PageContext & { kind?: 'assistant' | 'project' })
  | { kind: 'direct'; handle?: string; userId?: string; name?: string }
  | { kind: 'group'; groupId: string; title?: string };
export interface Participant {
  userId: string;
  name: string;
  state: 'active' | 'invited' | 'left' | 'blocked';
  role: string;
  joinedAt?: string;
  joinedSeq?: number;
  readSeq: number;
}
export interface Conversation {
  _id: string;
  kind: 'assistant' | 'direct' | 'room' | 'group' | 'project';
  title: string;
  createdBy?: string;
  participants: Participant[];
  projectId?: string;
  groupId?: string;
  trainingIds: string[];
  projectName?: string;
  trainingLabels?: { id: string; name: string }[];
  seq: number;
  lastMessageSeq?: number;
}
export interface Message {
  _id: string;
  kind: 'person' | 'assistant' | 'system';
  senderName: string;
  body: string;
  seq: number;
  createdAt: string;
  findingId?: string;
  evidence: { tool: string; input: Record<string, unknown>; at: string }[];
}
export interface Run {
  _id: string;
  /** The question this run answers. */
  messageId?: string;
  state: string;
  activity: string;
  error?: string;
}
const client = createApiClient({
  baseUrl: () => {
    const base = getGlobalConfig().CHAT_SERVICE_URL;
    if (!base) throw new Error('Chat is not configured for this deployment');
    return `${base.replace(/\/$/, '')}/api/chat`;
  }
});
export interface Capabilities {
  /** The analyst is on and ready to answer. */
  assistant: boolean;
  /** The signed-in user may change the analyst's settings, in Account. */
  canConfigure?: boolean;
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const result =
      body === undefined
        ? await client.get<{ data: T }>(path, { signal })
        : await client.post<{ data: T }>(path, body, { signal });
    return result.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error('Sign in to use chat', { cause: error });
    throw error;
  }
}
