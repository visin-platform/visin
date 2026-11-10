import { ApiError } from '@visin/frontend-core';
import { chatService } from '../services/chatService';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, Message, PageContext } from '../types/chat';
import type { SharedAssistantSettings } from '../types/assistant';
import { matchesContext } from '../utils/chatContext';
import { defaultAssistantId } from '../utils/defaultAssistant';

export function useChatNavigation({
  userId,
  conversations,
  loaded = false
}: {
  userId?: string;
  conversations: Conversation[];
  loaded?: boolean;
}) {
  const [selected, setSelected] = useState<string>();

  const [pending, setPending] = useState<PageContext>();

  const [composing, setComposing] = useState(false);

  const [draft, setDraft] = useState('');

  const [sharedTarget, setSharedTarget] = useState('');
  const [sharedSettings, setSharedSettings] = useState<{
    conversationId: string;
    settings?: SharedAssistantSettings;
  }>();
  const [replyTarget, setReplyTarget] = useState<Message>();

  const chooseSharedAssistant = useCallback((id: string) => {
    setSharedTarget(id);
    if (id) setReplyTarget(undefined);
  }, []);

  const [restoreError, setRestoreError] = useState('');
  const [restored, setRestored] = useState<{ userId?: string; conversation: Conversation }>();
  const c =
    conversations.find((c) => c._id === selected) ||
    (restored && restored.userId === userId && restored.conversation._id === selected
      ? restored.conversation
      : undefined);

  const me = c?.participants.find((p) => p.userId === userId);

  const detail = Boolean(selected || composing || pending);

  const analyzeVersion = useRef(0);
  useEffect(
    () => () => {
      analyzeVersion.current++;
    },
    []
  );
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const show = useCallback(
    (id: string | undefined) => {
      if (currentUser.current !== userId) return;
      analyzeVersion.current++;
      window.dispatchEvent(new CustomEvent('visin:chat-selected', { detail: id }));
      setSharedTarget('');
      setSharedSettings(undefined);
      setReplyTarget(undefined);
      setSelected(id);
      setPending(undefined);
      setComposing(false);
      setDraft('');
    },
    [userId]
  );

  const previousUser = useRef<string | undefined>(undefined);
  const initialized = useRef(false);
  useEffect(() => {
    if (previousUser.current && previousUser.current !== userId)
      sessionStorage.removeItem(`visin.chat.selected.${previousUser.current}`);
    const stored = sessionStorage.getItem(`visin.chat.selected.${userId || ''}`);
    const fromUrl = new URLSearchParams(window.location.search).get('conversation');
    show(userId ? (!initialized.current ? fromUrl : null) || stored || undefined : undefined);
    initialized.current = true;
    previousUser.current = userId;
  }, [userId, show]);

  // A notification tapped while chat is open: the shell announces which conversation it was about.
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (userId && typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) show(id);
    };
    window.addEventListener('visin:chat-open', open);
    return () => window.removeEventListener('visin:chat-open', open);
  }, [userId, show]);

  useEffect(() => {
    if (userId && selected) {
      sessionStorage.setItem(`visin.chat.selected.${userId}`, selected);
      window.dispatchEvent(new CustomEvent('visin:chat-selected', { detail: selected }));
    }
  }, [selected, userId]);

  const forgetSelection = useCallback(() => {
    if (userId) sessionStorage.removeItem(`visin.chat.selected.${userId}`);
    const url = new URL(window.location.href);
    if (url.searchParams.has('conversation')) {
      url.searchParams.delete('conversation');
      window.history.replaceState(window.history.state, '', url);
    }
    show(undefined);
  }, [userId, show]);

  useEffect(() => {
    setRestoreError('');
    if (!loaded || !selected || conversations.some((item) => item._id === selected)) return;
    const controller = new AbortController();
    // The list is capped at 100. A missing row may still be an accessible older conversation.
    void chatService
      .get(selected, controller.signal)
      .then((conversation) => {
        if (controller.signal.aborted) return;
        if (conversation?._id !== selected) forgetSelection();
        else setRestored({ userId, conversation });
      })
      .catch((error: unknown) => {
        // Temporary transport failures must not erase an older remembered thread or its draft.
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) forgetSelection();
        else setRestoreError('Could not reopen this conversation. Retrying…');
      });
    return () => controller.abort();
  }, [loaded, selected, conversations, userId, forgetSelection]);

  const latest = useRef({ conversations, current: c, composing });

  useEffect(() => {
    latest.current = { conversations, current: c, composing };
  });

  const analyze = useCallback(
    async (asked: PageContext) => {
      // A page asks for "this run" or "this paper" without naming who answers: the person's default analyst does, so a
      // thread already started with it is found again, and a new one starts with it.
      const version = ++analyzeVersion.current;
      const preferred = asked.assistantId ? undefined : await defaultAssistantId();
      if (currentUser.current !== userId || version !== analyzeVersion.current) return;
      const context = preferred ? { ...asked, assistantId: preferred } : asked;
      const match = latest.current.conversations.find((item) => matchesContext(item, context));
      if (match) show(match._id);
      else {
        show(undefined);
        setPending(context);
      }
    },
    [show, userId]
  );
  return {
    accountId: userId,
    restoreError,
    forgetSelection,
    selected,
    pending,
    composing,
    setComposing,
    draft,
    setDraft,
    sharedSettings,
    setSharedSettings,
    sharedTarget,
    setSharedTarget,
    chooseSharedAssistant,
    replyTarget,
    setReplyTarget,
    c,
    me,
    detail,
    show,
    analyze
  };
}
