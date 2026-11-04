import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Message } from '../types/chat';
import { useChatActions } from './useChatActions';
import { useChatConversations } from './useChatConversations';
import { useChatNavigation } from './useChatNavigation';
import { useChatThread } from './useChatThread';
import { usePageChatContext } from './usePageChatContext';

export function useChatWorkspace({ panel }: { panel: boolean }) {
  const { user, isAuthenticated, isLoading, login } = useAuth();

  const [error, setError] = useState('');

  const [showPeople, setShowPeople] = useState(false);

  const [finding, setFinding] = useState<Message>();

  const perform = useCallback(async (operation: () => Promise<void>) => {
    try {
      setError('');
      await operation();
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const list = useChatConversations({ userId: isAuthenticated ? user?.id : undefined, isAuthenticated, setError });
  const navigation = useChatNavigation({
    userId: isAuthenticated ? user?.id : undefined,
    conversations: list.conversations,
    loaded: list.loaded
  });
  const thread = useChatThread({
    selected: navigation.selected,
    userId: isAuthenticated ? user?.id : undefined,
    isAuthenticated,
    setError,
    setConversations: list.setConversations
  });
  const actions = useChatActions({ navigation, thread, refreshList: list.refreshList, perform });
  const pageContext = usePageChatContext({
    panel,
    loaded: list.loaded,
    enabled: list.enabled,
    current: navigation.c,
    composing: navigation.composing,
    handle: actions.handle,
    analyze: navigation.analyze
  });
  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    error: error || navigation.restoreError,
    setError,
    perform,
    ...list,
    ...navigation,
    ...thread,
    ...actions,
    pageContext,
    showPeople,
    setShowPeople,
    finding,
    setFinding
  };
}

export type ChatWorkspace = ReturnType<typeof useChatWorkspace>;
