import { ApiError } from '@visin/frontend-core';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getGlobalConfig } from '../config/ConfigProvider';
import { chatService } from '../services/chatService';

import type { Conversation, Message, Run } from '../types/chat';
import { PAGE, mergeMessages } from '../utils/messages';
import { useConversationRows } from './useConversationRows';

export function useChatThread({
  selected,
  userId,
  isAuthenticated,
  setError,
  setConversations
}: {
  selected?: string;
  userId?: string;
  isAuthenticated: boolean;
  setError: (error: string) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
}) {
  const [messages, setMessages] = useConversationRows<Message>(`${userId}:${selected}`);

  const [runs, setRuns] = useConversationRows<Run>(`${userId}:${selected}`);

  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('connecting');

  const [hasOlder, setHasOlder] = useState(false);

  const running = runs.some((r) => r.state === 'queued' || r.state === 'running');

  useEffect(() => {
    if (!selected || !isAuthenticated) {
      setMessages([]);
      setRuns([]);
      return;
    }
    const controller = new AbortController();
    setMessages([]);
    setRuns([]);
    setHasOlder(false);
    setError('');
    const streamBase = getGlobalConfig().CHAT_SERVICE_URL;
    let stream: EventSource | undefined;
    let streaming = false;
    let lastEvent = Date.now();
    let revision = 0;
    let replayAfter = 0;
    const disconnect = () => {
      const previous = stream;
      stream = undefined;
      streaming = false;
      previous?.close();
    };
    setConnection('connecting');
    const connect = () => {
      disconnect();
      lastEvent = Date.now();
      if (!navigator.onLine) {
        setConnection('offline');
        return;
      }
      if (!streamBase || typeof EventSource === 'undefined') return;
      stream = new EventSource(
        `${streamBase.replace(/\/$/, '')}/api/chat/conversations/${selected}/events${replayAfter ? `?after=${replayAfter}` : ''}`,
        {
          withCredentials: true
        }
      );
      const source = stream;
      stream.addEventListener('open', () => {
        if (controller.signal.aborted || source !== stream) return;
        lastEvent = Date.now();
        streaming = true;
        setConnection('live');
      });
      stream.addEventListener('error', () => {
        if (controller.signal.aborted || source !== stream) return;
        streaming = false;
        setConnection(navigator.onLine ? 'reconnecting' : 'offline');
      });
      stream.addEventListener('heartbeat', () => {
        if (controller.signal.aborted || source !== stream) return;
        lastEvent = Date.now();
      });
      stream.addEventListener('state', (event) => {
        if (controller.signal.aborted || source !== stream) return;
        try {
          const state = JSON.parse((event as MessageEvent).data) as { messages: Message[]; runs: Run[] };
          if (!Array.isArray(state.messages) || !Array.isArray(state.runs)) return;
          lastEvent = Date.now();
          streaming = true;
          const cursor = Number((event as MessageEvent).lastEventId);
          replayAfter = Math.max(
            replayAfter,
            Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0,
            ...state.messages.map((message) => message.seq)
          );
          revision++;
          setConnection('live');
          setMessages((rows) => mergeMessages(rows, state.messages));
          setRuns(state.runs);
        } catch {
          streaming = false;
          setConnection('reconnecting');
        }
      });
    };
    connect();
    let first = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      if (!navigator.onLine) {
        setConnection('offline');
        return;
      }
      loading = true;
      const startedAt = revision;
      try {
        const [rows, jobs] = await Promise.all([
          chatService.messages(selected!, controller.signal),
          chatService.runs(selected!, controller.signal)
        ]);
        if (controller.signal.aborted) return;
        if (first) setHasOlder(rows.length === PAGE);
        setError('');
        first = false;
        setMessages((old) => mergeMessages(old, rows));
        if (startedAt === revision) setRuns(jobs);
        if (!streaming) setConnection(streamBase && typeof EventSource !== 'undefined' ? 'reconnecting' : 'live');
      } catch (e) {
        if (!controller.signal.aborted) {
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            disconnect();
            setMessages([]);
            setRuns([]);
          }
          setConnection(navigator.onLine ? 'reconnecting' : 'offline');
          setError((e as Error).message);
        }
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      if (streaming && Date.now() - lastEvent > 45000) {
        setConnection('reconnecting');
        connect();
      }
      if (!streaming) void load();
    }, 5000);
    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      if (!navigator.onLine) {
        streaming = false;
        setConnection('offline');
        return;
      }
      if (!streaming || Date.now() - lastEvent > 45000) connect();
      void load();
    };
    const offline = () => {
      disconnect();
      setConnection('offline');
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      controller.abort();
      stream?.close();
      clearInterval(timer);
    };
  }, [selected, userId, isAuthenticated, setMessages, setRuns, setError]);

  const lastSeq = messages.at(-1)?.seq;

  const readSent = useRef<{ userId: string; conversation: string; seq: number } | undefined>(undefined);

  useEffect(() => {
    if (!selected || lastSeq === undefined || !userId) return;
    if (
      readSent.current?.userId === userId &&
      readSent.current.conversation === selected &&
      readSent.current.seq >= lastSeq
    )
      return;
    const sent = { userId, conversation: selected, seq: lastSeq };
    readSent.current = sent;
    let current = true;
    void chatService
      .markRead(selected!, lastSeq)
      .then(() => {
        if (!current) return;
        setConversations((list) =>
          list.map((item) =>
            item._id === selected
              ? {
                  ...item,
                  participants: item.participants.map((p) =>
                    p.userId === userId ? { ...p, readSeq: Math.max(p.readSeq || 0, lastSeq) } : p
                  )
                }
              : item
          )
        );
      })
      .catch(() => {
        if (readSent.current === sent) readSent.current = undefined;
      });
    return () => {
      current = false;
    };
  }, [selected, lastSeq, userId, setConversations]);

  const scroller = useRef<HTMLDivElement>(null);

  const atBottom = useRef(true);

  const activity = runs.find((r) => r.state === 'running')?.activity;

  useEffect(() => {
    atBottom.current = true;
  }, [selected]);

  useEffect(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
  }, [lastSeq, activity, running]);
  return {
    connection,
    messages,
    setMessages,
    runs,
    setRuns,
    hasOlder,
    setHasOlder,
    running,
    scroller,
    atBottom,
    activity
  };
}
