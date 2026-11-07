/** What a page of Vision is about (a run, a comparison, a project), for the analyst. */
export interface PageContext {
  assistantId?: string;
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
  latestMessage?: { body: string; createdAt: string };
  profile?: { id: string; handle: string; name?: string; picture?: string; lastActiveAt?: string };
  assistantId?: string;
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

export interface ReplyQuote {
  messageId: string;
  senderName: string;
  body: string;
  kind: 'person' | 'assistant' | 'system';
}

export interface Message {
  senderId?: string;
  _id: string;
  kind: 'person' | 'assistant' | 'system';
  senderName: string;
  body: string;
  seq: number;
  createdAt: string;
  findingId?: string;
  replyTo?: string;
  quote?: ReplyQuote;
  evidence: { tool: string; input: Record<string, unknown>; at: string }[];
}

export interface Run {
  userId?: string;
  assistantName?: string;
  canCancel?: boolean;
  canRetry?: boolean;
  assistantId?: string;
  _id: string;
  /** The question this run answers. */
  messageId?: string;
  state: string;
  activity: string;
  error?: string;
}

export interface Capabilities {
  assistantModel?: { provider: string; model: string; ready: boolean };
  /** The analyst is on and ready to answer. */
  assistant: boolean;
  /** The signed-in user may change the analyst's settings, in Account. */
  canConfigure?: boolean;
  sharedAssistant?: boolean;
}

export interface ChatGroup {
  groupId: string;
  name: string;
}

export interface ChatContact {
  id: string;
  name: string;
}

export interface ChatProject {
  _id: string;
  name: string;
}

export interface CreateConversationInput {
  kind: Conversation['kind'];
  title: string;
  assistantId?: string;
  projectId?: string;
  trainingIds?: string[];
  handles?: string[];
  userIds?: string[];
  groupId?: string;
}

export interface SendMessageInput {
  body: string;
  clientId: string;
  assistantId?: string;
  replyTo?: string;
  /** The side panel's tab and page, so the analyst can change the page beside it. */
  screen?: {
    tabId: string;
    path: string;
    allowActions?: boolean;
    actions?: { name: 'open_frame'; ids: string[]; labels?: string[] }[];
  };
}

export interface FindingInput {
  messageId: string;
  title: string;
  body: string;
  recommendations?: string;
}
