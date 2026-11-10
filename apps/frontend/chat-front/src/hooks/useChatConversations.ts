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

  const [groups, setGroups] = useState<{ groupId: string; name: string }[]>([]);

  const [assistantModel, setAssistantModel] = useState<Capabilities['assistantModel']>();

  const [attachmentsAvailable, setAttachmentsAvailable] = useState(false);

  const [enabled, setEnabled] = useState(false);

  const [sharedAvailable, setSharedAvailable] = useState(false);

  const [canConfigure, setCanConfigure] = useState(false);
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
    setLoaded(false);
  }, [userId]);
  const refreshList = useCallback(async () => {
    const rows = await chatService.list();
    if (currentUser.current === userId) setConversations(rows);
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
        setLoaded(true);
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
    loaded,
    groups,
    enabled,
    sharedAvailable,
    canConfigure,
    refreshList
  };
}
