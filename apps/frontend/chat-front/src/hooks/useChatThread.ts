import { ApiError } from '@visin/frontend-core';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getGlobalConfig } from '../config/ConfigProvider';
import { chatService } from '../services/chatService';

import type { Conversation, Draft, Message, MessageUpdate, Run } from '../types/chat';
import { PAGE, mergeMessages, applyMessageUpdates } from '../utils/messages';
import { TAB_ID, parseScreenCalls, showOnScreen, type ScreenCall, type ScreenResult } from '../utils/screen';
import { useConversationRows } from './useConversationRows';

export function useChatThread({
  selected,
  userId,
  isAuthenticated,
  panel = false,
  setError,
  setConversations
}: {
  selected?: string;
  userId?: string;
  isAuthenticated: boolean;
  /** In the shell's side panel: the stream then also carries the analyst's requests to change the page. */
  panel?: boolean;
  setError: (error: string) => void;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
}) {
  const threadKey = `${userId}:${selected}`;
  const [messages, setMessageRows] = useConversationRows<Message>(threadKey);
  const mutationCache = useRef({ key: threadKey, updates: new Map<string, MessageUpdate>() });
  if (mutationCache.current.key !== threadKey) mutationCache.current = { key: threadKey, updates: new Map() };
  const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>(
    (next) =>
      setMessageRows((rows) => {
        const result = typeof next === 'function' ? next(rows) : next;
        return applyMessageUpdates(
          result,
          mutationCache.current.key === threadKey ? [...mutationCache.current.updates.values()] : []
        );
      }),
    [threadKey, setMessageRows]
  );

  const [runs, setRuns] = useConversationRows<Run>(`${userId}:${selected}`);

  const [drafts, setDrafts] = useConversationRows<Draft>(`${userId}:${selected}`);

  const [selections, setSelections] = useConversationRows<Pick<Conversation, 'trainingIds' | 'trainingLabels'>>(
    `${userId}:${selected}`
  );

  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('connecting');

  const [hasOlder, setHasOlder] = useState(false);

  const running = runs.some((r) => r.state === 'queued' || r.state === 'running');
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (!selected || !isAuthenticated) {
      setMessages([]);
      setRuns([]);
      setDrafts([]);
      return;
    }
    const controller = new AbortController();
    setMessages([]);
    setRuns([]);
    setDrafts([]);
    setHasOlder(false);
    setError('');
    const streamBase = getGlobalConfig().CHAT_SERVICE_URL;
    let stream: EventSource | undefined;
    // A reconnect may repeat a call that is still pending; it is acted on once.
    const handled = new Set<string>();
    let screenWaiting = false;
    const answers = new Map<string, ScreenResult>();
    const answering = new Set<string>();
    const reply = async (id: string) => {
      const result = answers.get(id);
      if (!result || answering.has(id) || controller.signal.aborted) return;
      answering.add(id);
      try {
        await chatService.screenResult(id, result);
        answers.delete(id);
      } catch {
        /* A pending call is polled again; retry the answer without navigating twice. */
      } finally {
        answering.delete(id);
      }
    };
    const receiveScreens = (calls: ScreenCall[]) => {
      if (!panel || controller.signal.aborted) return;
      for (const call of calls) {
        if (handled.has(call.id)) {
          void reply(call.id);
          continue;
        }
        handled.add(call.id);
        screenWaiting = true;
        revision++;
        void showOnScreen(call).then((result) => {
          if (controller.signal.aborted) return;
          answers.set(call.id, result);
          void reply(call.id);
        });
      }
    };
    let pollingScreens = false;
    const pollScreens = async () => {
      if (!panel || pollingScreens || !navigator.onLine || controller.signal.aborted) return;
      pollingScreens = true;
      try {
        receiveScreens(await chatService.screenCalls(selected!, TAB_ID, controller.signal));
      } catch {
        /* Stream and polling recover independently; never interrupt the conversation. */
      } finally {
        pollingScreens = false;
      }
    };
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
      const query = new URLSearchParams();
      if (replayAfter) query.set('after', String(replayAfter));
      if (panel) query.set('tab', TAB_ID);
      stream = new EventSource(
        `${streamBase.replace(/\/$/, '')}/api/chat/conversations/${selected}/events${query.size ? `?${query}` : ''}`,
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
      stream.addEventListener('screen', (event) => {
        if (controller.signal.aborted || source !== stream) return;
        lastEvent = Date.now();
        receiveScreens(parseScreenCalls((event as MessageEvent).data));
      });
      stream.addEventListener('selection', (event) => {
        if (controller.signal.aborted || source !== stream) return;
        try {
          const selection = JSON.parse((event as MessageEvent).data) as Pick<
            Conversation,
            'trainingIds' | 'trainingLabels'
          >;
          if (
            !Array.isArray(selection.trainingIds) ||
            !selection.trainingIds.every((id) => typeof id === 'string') ||
            !Array.isArray(selection.trainingLabels)
          )
            return;
          lastEvent = Date.now();
          setSelections([selection]);
          setConversations((rows) =>
            rows.map((row) =>
              row._id === selected && row.kind === 'assistant'
                ? { ...row, trainingIds: selection.trainingIds, trainingLabels: selection.trainingLabels }
                : row
            )
          );
        } catch {
          /* Ignore malformed frames; the next connection replays the selection. */
        }
      });
      // The analyst's answer as written so far. Empty text means the draft is over (the answer is a message now, or
      // the run failed). Not an event that moves the replay cursor: a draft is only ever the latest word.
      stream.addEventListener('draft', (event) => {
        if (controller.signal.aborted || source !== stream) return;
        try {
          const draft = JSON.parse((event as MessageEvent).data) as Draft;
          if (typeof draft.runId !== 'string' || typeof draft.messageId !== 'string' || typeof draft.text !== 'string')
            return;
          lastEvent = Date.now();
          setDrafts((rows) => {
            const others = rows.filter((row) => row.runId !== draft.runId);
            return draft.text ? [...others, draft] : others;
          });
        } catch {
          /* A frame that is not a draft is skipped; the next one carries the whole text again. */
        }
      });
      stream.addEventListener('message-updates', (event) => {
        if (controller.signal.aborted || source !== stream) return;
        try {
          const updates = JSON.parse((event as MessageEvent).data) as MessageUpdate[];
          if (
            !Array.isArray(updates) ||
            !updates.every(
              (update) =>
                typeof update._id === 'string' &&
                Number.isSafeInteger(update.revision) &&
                Array.isArray(update.reactions) &&
                update.reactions.every(
                  (reaction) => reaction && typeof reaction.userId === 'string' && typeof reaction.emoji === 'string'
                )
            )
          )
            return;
          lastEvent = Date.now();
          revision++;
          for (const update of updates) {
            const previous = mutationCache.current.updates.get(update._id);
            if ((update.revision ?? 0) >= (previous?.revision ?? 0))
              mutationCache.current.updates.set(update._id, update);
          }
          setMessages((rows) => applyMessageUpdates(rows, updates));
        } catch {
          /* Reconciliation replays persisted message mutations after reconnect. */
        }
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
    if (panel) void pollScreens();
    // Calls exist only while a run is working. The stream brings them within about half a second; this HTTP
    // fallback covers a stream that is down (every second) or held by a buffering proxy (every third second, since
    // each request re-checks access with other services).
    let screenTicks = 0;
    const screenTimer = panel
      ? setInterval(() => {
          screenTicks++;
          if (runningRef.current && (!streaming || screenTicks % 3 === 0)) void pollScreens();
        }, 1000)
      : undefined;
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
        if (startedAt === revision) {
          setRuns(jobs);
          screenWaiting = jobs.some((job) => job.state === 'queued' || job.state === 'running');
        }
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
      if (!streaming || runningRef.current || screenWaiting) void load();
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
      if (panel) void pollScreens();
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
      clearInterval(screenTimer);
    };
  }, [
    selected,
    userId,
    isAuthenticated,
    panel,
    setMessages,
    setRuns,
    setDrafts,
    setError,
    setConversations,
    setSelections
  ]);

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

  // The answer growing keeps the end in view for someone who is reading at the end, and does not drag anyone back
  // who scrolled up.
  const draftLength = drafts.reduce((total, draft) => total + draft.text.length, 0);
  useEffect(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
  }, [lastSeq, activity, running, draftLength]);
  return {
    connection,
    selection: selections[0],
    messages,
    setMessages,
    runs,
    setRuns,
    drafts,
    hasOlder,
    setHasOlder,
    running,
    scroller,
    atBottom,
    activity
  };
}
