import { useCallback, useEffect, useRef, useState } from 'react';
import { chatService } from '../services/chatService';

import type { Capabilities, Conversation } from '../types/chat';
import { ANALYST_SETTINGS_EVENT } from '../utils/analystSettingsLink';

export function useChatConversations({
  userId,
  isAuthenticated,
  setError
}: {
  userId?: string;
  isAuthenticated: boolean;
  setError: (error: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [loaded, setLoaded] = useState(false);

  /** The conversations this person has put away: shown apart, so putting one away is never losing it. */
  const [hidden, setHidden] = useState<Conversation[]>([]);

  const [groups, setGroups] = useState<{ groupId: string; name: string }[]>([]);

  const [assistantModel, setAssistantModel] = useState<Capabilities['assistantModel']>();

  const [attachmentsAvailable, setAttachmentsAvailable] = useState(false);

  const [enabled, setEnabled] = useState(false);

  const [sharedAvailable, setSharedAvailable] = useState(false);

  const [canConfigure, setCanConfigure] = useState(false);
  const hiddenRead = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  useEffect(() => {
    setGroups([]);
    setEnabled(false);
    setSharedAvailable(false);
    setAttachmentsAvailable(false);
    setCanConfigure(false);
    setAssistantModel(undefined);
    setConversations([]);
    setHidden([]);
    hiddenRead.current = false;
    setLoaded(false);
  }, [userId]);
  const refreshList = useCallback(async () => {
    const rows = await chatService.list();
    if (currentUser.current !== userId) return;
    setConversations(rows);
    // Writing in a hidden chat brings it back; it is in the list again and no longer among the hidden.
    setHidden((away) => away.filter((item) => !rows.some((row) => row._id === item._id)));
  }, [userId]);
  const refreshHidden = useCallback(async () => {
    const away = await chatService.listHidden();
    if (currentUser.current === userId) setHidden(away);
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    const failed = (e: unknown) => {
      if (!controller.signal.aborted) setError((e as Error).message);
    };
    // Groups change rarely and are read once. Whether the analyst answers is read again whenever it may have
    // changed: an administrator turning it on in Account (announced on the page), the page coming back into view,
    // and once a minute, since the shell keeps this chat mounted while other pages are used.
    void chatService
      .groups(controller.signal)
      .then((ownGroups) => {
        if (!controller.signal.aborted) setGroups(ownGroups);
      })
      .catch(failed);
    const readCapabilities = () =>
      void chatService
        .capabilities(controller.signal)
        .then((capabilities) => {
          if (controller.signal.aborted) return;
          setAttachmentsAvailable(Boolean(capabilities.attachments));
          setAssistantModel(capabilities.assistantModel);
          setEnabled(capabilities.assistant);
          setSharedAvailable(Boolean(capabilities.sharedAssistant));
          setCanConfigure(Boolean(capabilities.canConfigure));
        })
        .catch(failed);
    readCapabilities();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') readCapabilities();
    };
    window.addEventListener(ANALYST_SETTINGS_EVENT, readCapabilities);
    document.addEventListener('visibilitychange', whenVisible);
    const capabilitiesTimer = setInterval(whenVisible, 60_000);
    const load = async () => {
      try {
        const list = await chatService.list(controller.signal);
        if (controller.signal.aborted) return;
        setConversations(list);
        // A hidden chat that someone wrote in is back in the list: it is no longer hidden. Read once, then kept
        // from the list, rather than asked for again on every poll.
        setHidden((away) => away.filter((item) => !list.some((row) => row._id === item._id)));
        setLoaded(true);
        if (!hiddenRead.current) {
          hiddenRead.current = true;
          const away = await chatService.listHidden(controller.signal).catch(() => undefined);
          if (away && !controller.signal.aborted) setHidden(away);
        }
      } catch (e) {
        failed(e);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(capabilitiesTimer);
      window.removeEventListener(ANALYST_SETTINGS_EVENT, readCapabilities);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [isAuthenticated, userId, setError]);
  return {
    attachmentsAvailable,
    assistantModel,
    conversations,
    setConversations,
    hidden,
    refreshHidden,
    loaded,
    groups,
    enabled,
    sharedAvailable,
    canConfigure,
    refreshList
  };
}
