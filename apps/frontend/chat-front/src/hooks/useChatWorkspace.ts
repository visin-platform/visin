import { useChatAppearance } from '../appearance/useChatAppearance';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Message, PageContext } from '../types/chat';
import { OPEN_EVENT, contextKey, placeOf, samePage } from '../utils/chatContext';
import { useCurrentPath } from '../utils/screen';
import { useChatActions } from './useChatActions';
import { useChatConversations } from './useChatConversations';
import { useChatNavigation } from './useChatNavigation';
import { useChatThread } from './useChatThread';
import { usePageChatContext } from './usePageChatContext';

export function useChatWorkspace({ panel }: { panel: boolean }) {
  const { user, isAuthenticated, isLoading, login } = useAuth();

  const appearance = useChatAppearance(isAuthenticated ? user?.id : undefined);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
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
    hidden: list.hidden,
    loaded: list.loaded
  });
  const thread = useChatThread({
    selected: navigation.selected,
    userId: isAuthenticated ? user?.id : undefined,
    isAuthenticated,
    panel,
    setError,
    setConversations: list.setConversations
  });
  // Older restored threads may sit outside the capped conversation list. Apply their streamed selection too.
  const currentNavigation = {
    ...navigation,
    c: navigation.c && thread.selection ? { ...navigation.c, ...thread.selection } : navigation.c
  };
  // What the next question is about: the page the person is on, until they clear it. Each question carries it, so
  // the same chat serves every page and a question is answered about the page it was asked on.
  const aboutRef = useRef<PageContext | undefined>(undefined);
  /** The person cleared the page beside the panel: the next question sends no page to read. */
  const hidePageRef = useRef(false);
  const actions = useChatActions({
    navigation: currentNavigation,
    thread,
    refreshList: list.refreshList,
    refreshHidden: list.refreshHidden,
    perform,
    aboutRef,
    hidePageRef,
    panel
  });
  const pageContext = usePageChatContext({
    panel,
    loaded: list.loaded,
    enabled: list.enabled,
    current: currentNavigation.c,
    composing: navigation.composing,
    pending: navigation.pending,
    handle: actions.handle,
    analyze: navigation.analyze
  });
  const [clearedAbout, setClearedAbout] = useState<string>();
  // Asking about something on purpose shows it again, even when it is what the person had cleared.
  useEffect(() => {
    const reset = () => setClearedAbout(undefined);
    window.addEventListener(OPEN_EVENT, reset);
    return () => window.removeEventListener(OPEN_EVENT, reset);
  }, []);
  // Beside the panel, a page with nothing else to name (a dataset, a suite) is named by its address, and a page asked
  // about counts only while it is the one shown: the panel always sends the page it can see.
  const shownPath = useCurrentPath();
  const place = panel ? placeOf(shownPath) : undefined;
  const askedPage = pageContext?.page && !pageContext.projectId && !pageContext.paperId;
  const asked =
    (askedPage && panel && !samePage(pageContext.page!, shownPath)) || !contextKey(pageContext) ? place : pageContext;
  const aboutKey = contextKey(asked);
  // Clearing it lasts until the page, or what was asked about, changes.
  const about = aboutKey && aboutKey !== clearedAbout ? asked : undefined;
  aboutRef.current = about;
  hidePageRef.current = Boolean(panel && asked?.page && !about);
  return {
    appearance,
    appearanceOpen,
    setAppearanceOpen,
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
    c: currentNavigation.c,
    ...actions,
    pageContext,
    /** Chat is the shell's side panel, beside a page it can see. */
    panel,
    about,
    clearAbout: () => setClearedAbout(aboutKey),
    /** Opens the chat with the assistant, asking about this: what the next question is about. */
    openAbout: (context: PageContext) =>
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { kind: 'assistant', ...context } })),
    showPeople,
    setShowPeople,
    finding,
    setFinding
  };
}

export type ChatWorkspace = ReturnType<typeof useChatWorkspace>;
