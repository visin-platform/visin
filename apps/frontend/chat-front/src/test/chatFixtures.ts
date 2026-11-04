import { act } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import type { Conversation, Message, Run } from '../types/chat';

export const state = {
  authenticated: true,
  enabled: false,
  admin: false,
  accountUrl: undefined as string | undefined,
  conversations: [] as Conversation[],
  messages: [] as Message[],
  runs: [] as Run[]
};

vi.mock('../contexts/AuthContext', () => ({
  authService: { getProfile: vi.fn(async () => ({ id: 'alice', handle: 'alice', picture: 'https://example.test/alice.png' })) },
  useAuth: () => ({ user: { id: 'alice' }, isAuthenticated: state.authenticated, isLoading: false, login: vi.fn() })
}));

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ CHAT_SERVICE_URL: 'http://chat.test', ACCOUNT_FRONT_URL: state.accountUrl })
}));

vi.mock('../services/apiClient', () => ({
  api: vi.fn(async (path: string, body?: unknown) => {
    if (path === '/conversations' && body) return { ...state.conversations[0], _id: 'created' };
    if (path === '/conversations') return state.conversations;
    if (path === '/capabilities') return { assistant: state.enabled, canConfigure: state.admin };
    if (path.endsWith('/runs')) return state.runs;
    if (path === '/groups') return [];
    if (path === '/assistants') return [];
    if (path === '/projects') return [{ _id: 'p1', name: 'Road scene experiments' }];
    if (path.endsWith('/messages') && body) return {};
    if (path.endsWith('/messages')) return state.messages;
    return {};
  })
}));

export const dm = (): Conversation => ({
  _id: 'c1',
  title: 'Research discussion',
  kind: 'direct',
  participants: [
    { userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 },
    { userId: 'bob', name: 'Bob', state: 'active', role: 'member', readSeq: 0 }
  ],
  seq: 0,
  trainingIds: []
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  state.authenticated = true;
  state.enabled = false;
  state.admin = false;
  state.accountUrl = undefined;
  state.conversations = [dm()];
  state.messages = [];
  state.runs = [];
  delete window.__visinChatContext;
  delete window.__visinPageContext;
});

export const analysisOf = (overrides: Partial<Conversation> = {}): Conversation => ({
  ...dm(),
  _id: 'a1',
  kind: 'assistant',
  title: 'Base model analysis',
  projectId: 'p1',
  trainingIds: ['t1'],
  participants: [{ userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 }],
  ...overrides
});

export const showPage = (detail: unknown) =>
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail }));
  });
