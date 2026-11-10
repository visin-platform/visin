import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ CHAT_SERVICE_URL: 'http://chat.test' }) }));
vi.mock('../services/chatService', () => ({
  chatService: {
    messages: vi.fn(async () => []),
    runs: vi.fn(async () => []),
    markRead: vi.fn(async () => {}),
    screenCalls: vi.fn(async (): Promise<{ id: string; place: string; params: Record<string, unknown> }[]> => []),
    screenResult: vi.fn(async () => {})
  }
}));
import { chatService } from '../services/chatService';
import { useChatThread } from './useChatThread';
import type { Run } from '../types/chat';
class Stream extends EventTarget {
  static instances: Stream[] = [];
  close = vi.fn();
  url: string;
  constructor(url: string) {
    super();
    this.url = url;
    Stream.instances.push(this);
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  Stream.instances = [];
});
it('restarts silent streams, polls while reconnecting, and stops polling after recovery', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Stream);
  const setError = vi.fn(),
    setConversations = vi.fn();
  const { result, unmount } = renderHook(() =>
    useChatThread({ selected: 'c1', userId: 'alice', isAuthenticated: true, setError, setConversations })
  );
  await act(async () => {});
  const first = Stream.instances[0];
  act(() => first.dispatchEvent(new Event('open')));
  expect(result.current.connection).toBe('live');
  const calls = vi.mocked(chatService.messages).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(chatService.messages).toHaveBeenCalledTimes(calls);
  act(() => first.dispatchEvent(new Event('heartbeat')));
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(Stream.instances).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(first.close).toHaveBeenCalled();
  expect(Stream.instances).toHaveLength(2);
  expect(chatService.messages).toHaveBeenCalledTimes(calls + 1);
  act(() => Stream.instances[1].dispatchEvent(new Event('open')));
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(chatService.messages).toHaveBeenCalledTimes(calls + 1);
  unmount();
  expect(Stream.instances[1].close).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('refreshes on tab resume and reconnects after offline without duplicating replayed messages', async () => {
  vi.stubGlobal('EventSource', Stream);
  const { result, unmount } = renderHook(() =>
    useChatThread({
      selected: 'c1',
      userId: 'alice',
      isAuthenticated: true,
      setError: error,
      setConversations: conversations
    })
  );
  await act(async () => {});
  const frame = new MessageEvent('state', {
    lastEventId: '1',
    data: JSON.stringify({ messages: [{ _id: 'm1', seq: 1, body: 'Hi' }], runs: [] })
  });
  act(() => {
    Stream.instances[0].dispatchEvent(frame);
    Stream.instances[0].dispatchEvent(frame);
  });
  expect(result.current.messages).toHaveLength(1);
  act(() => window.dispatchEvent(new Event('offline')));
  expect(result.current.connection).toBe('offline');
  await act(async () => window.dispatchEvent(new Event('online')));
  expect(Stream.instances).toHaveLength(2);
  expect(Stream.instances[1].url).toContain('events?after=1');
  const calls = vi.mocked(chatService.messages).mock.calls.length;
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(chatService.messages).toHaveBeenCalledTimes(calls + 1);
  unmount();
  act(() => window.dispatchEvent(new Event('online')));
  expect(Stream.instances).toHaveLength(3);
});
const error = vi.fn(),
  conversations = vi.fn();

it('does not open streams or repeatedly poll while the browser is offline', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Stream);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const { result } = renderHook(() =>
    useChatThread({
      selected: 'c1',
      userId: 'alice',
      isAuthenticated: true,
      setError: error,
      setConversations: conversations
    })
  );
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(result.current.connection).toBe('offline');
  expect(chatService.messages).not.toHaveBeenCalled();
  expect(Stream.instances).toHaveLength(0);
});

it('marks a shared thread read again after switching accounts', async () => {
  vi.stubGlobal('EventSource', Stream);
  const { rerender } = renderHook(
    ({ userId }) =>
      useChatThread({
        selected: 'c1',
        userId,
        isAuthenticated: true,
        setError: error,
        setConversations: conversations
      }),
    { initialProps: { userId: 'alice' } }
  );
  await act(async () => {});
  const frame = () =>
    new MessageEvent('state', {
      lastEventId: '1',
      data: JSON.stringify({ messages: [{ _id: 'm1', seq: 1 }], runs: [] })
    });
  await act(async () => Stream.instances[0].dispatchEvent(frame()));
  expect(chatService.markRead).toHaveBeenCalledTimes(1);
  rerender({ userId: 'bob' });
  await act(async () => {});
  await act(async () => Stream.instances[1].dispatchEvent(frame()));
  expect(chatService.markRead).toHaveBeenCalledTimes(2);
});

it('opens its stream with the tab id only in the side panel', async () => {
  vi.stubGlobal('EventSource', Stream);
  const args = { selected: 'c1', userId: 'alice', isAuthenticated: true, setError: vi.fn(), setConversations: vi.fn() };
  const page = renderHook(() => useChatThread(args));
  await act(async () => {});
  expect(Stream.instances[0].url).not.toContain('tab=');
  page.unmount();
  const panel = renderHook(() => useChatThread({ ...args, panel: true }));
  await act(async () => {});
  expect(Stream.instances[1].url).toMatch(/\/events\?tab=[A-Za-z0-9_-]{8,64}$/);
  panel.unmount();
});
it('shows a requested place once and reports what the shell did', async () => {
  vi.stubGlobal('EventSource', Stream);
  const asked = vi.fn((event: Event) => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    window.dispatchEvent(
      new CustomEvent('visin:screen-done', { detail: { id, ok: true, summary: 'Opened projects' } })
    );
  });
  window.addEventListener('visin:screen', asked);
  const setError = vi.fn(),
    setConversations = vi.fn();
  const { unmount } = renderHook(() =>
    useChatThread({
      selected: 'c1',
      userId: 'alice',
      isAuthenticated: true,
      panel: true,
      setError,
      setConversations
    })
  );
  await act(async () => {});
  const stream = Stream.instances[0];
  const data = JSON.stringify([{ id: 'call1', place: 'projects', params: {} }]);
  await act(async () => {
    stream.dispatchEvent(new MessageEvent('screen', { data }));
    stream.dispatchEvent(new MessageEvent('screen', { data }));
  });
  expect(asked).toHaveBeenCalledTimes(1);
  expect(chatService.screenResult).toHaveBeenCalledWith('call1', { ok: true, summary: 'Opened projects' });
  await act(async () => {
    stream.dispatchEvent(new MessageEvent('screen', { data: 'garbage' }));
  });
  expect(asked).toHaveBeenCalledTimes(1);
  window.removeEventListener('visin:screen', asked);
  unmount();
});

it('updates the current private thread’s selected runs from selection events', async () => {
  vi.stubGlobal('EventSource', Stream);
  const setConversations = vi.fn(),
    setError = vi.fn();
  const { unmount } = renderHook(() =>
    useChatThread({ selected: 'c1', userId: 'alice', isAuthenticated: true, setError, setConversations })
  );
  await act(async () => {});
  const selection = {
    trainingIds: ['a', 'b'],
    trainingLabels: [
      { id: 'a', name: 'Run A' },
      { id: 'b', name: 'Run B' }
    ]
  };
  act(() => Stream.instances[0].dispatchEvent(new MessageEvent('selection', { data: JSON.stringify(selection) })));
  const change = setConversations.mock.calls.at(-1)![0];
  expect(
    change([
      { _id: 'c1', kind: 'assistant' },
      { _id: 'c2', kind: 'assistant' }
    ])
  ).toEqual([
    { _id: 'c1', kind: 'assistant', ...selection },
    { _id: 'c2', kind: 'assistant' }
  ]);
  expect(change([{ _id: 'c1', kind: 'direct' }])).toEqual([{ _id: 'c1', kind: 'direct' }]);
  unmount();
});

const working = { _id: 'run1', messageId: 'm1', state: 'running', activity: 'Opening a page' } as Run;

it('stops asking for screen calls while no run is working', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Stream);
  const setError = vi.fn(),
    setConversations = vi.fn();
  const { unmount } = renderHook(() =>
    useChatThread({ selected: 'c1', userId: 'alice', isAuthenticated: true, panel: true, setError, setConversations })
  );
  await act(async () => {});
  const first = vi.mocked(chatService.screenCalls).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(vi.mocked(chatService.screenCalls).mock.calls.length).toBe(first);
  unmount();
});

it('delivers a screen call through polling when streaming is unavailable, and retries only its acknowledgement', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', undefined);
  const call = { id: 'poll-call', place: 'projects', params: {} };
  // A call exists only while its run is working.
  vi.mocked(chatService.runs).mockResolvedValue([working]);
  vi.mocked(chatService.screenCalls).mockResolvedValue([call]);
  vi.mocked(chatService.screenResult).mockRejectedValueOnce(new Error('temporary network failure'));
  const asked = vi.fn((event: Event) => {
    window.dispatchEvent(
      new CustomEvent('visin:screen-done', {
        detail: { id: (event as CustomEvent).detail.id, ok: true, summary: 'Opened projects' }
      })
    );
  });
  window.addEventListener('visin:screen', asked);
  const setError = vi.fn(),
    setConversations = vi.fn();
  const { unmount } = renderHook(() =>
    useChatThread({ selected: 'c1', userId: 'alice', isAuthenticated: true, panel: true, setError, setConversations })
  );
  await act(async () => {});
  expect(asked).toHaveBeenCalledTimes(1);
  expect(chatService.screenCalls).toHaveBeenCalledWith('c1', expect.any(String), expect.any(AbortSignal));
  // The runs arrive with the next reload (rendered when its act ends), then the acknowledgement is retried.
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(asked).toHaveBeenCalledTimes(1);
  expect(chatService.screenResult).toHaveBeenCalledTimes(2);
  unmount();
  window.removeEventListener('visin:screen', asked);
  expect(vi.getTimerCount()).toBe(0);
});
/** Stable, like the real ones: the hook restarts its stream when they change. */
const noError = vi.fn();
const noConversations = vi.fn();
it('collects the analyst’s answer as it is written, and lets go of it when it is over', async () => {
  vi.stubGlobal('EventSource', Stream);
  const { result, unmount } = renderHook(() =>
    useChatThread({
      selected: 'c1',
      userId: 'alice',
      isAuthenticated: true,
      setError: noError,
      setConversations: noConversations
    })
  );
  await act(async () => {});
  const draft = (data: unknown) =>
    act(() => void Stream.instances[0].dispatchEvent(new MessageEvent('draft', { data: JSON.stringify(data) })));

  draft({ runId: 'r1', messageId: 'q1', text: 'Validation' });
  expect(result.current.drafts).toEqual([{ runId: 'r1', messageId: 'q1', text: 'Validation' }]);
  draft({ runId: 'r1', messageId: 'q1', text: 'Validation peaked at epoch 42.' });
  expect(result.current.drafts).toHaveLength(1);
  expect(result.current.drafts[0].text).toBe('Validation peaked at epoch 42.');
  draft({ runId: 'r2', messageId: 'q2', text: 'Another' });
  expect(result.current.drafts.map((d) => d.runId)).toEqual(['r1', 'r2']);

  draft({ runId: 'r1', messageId: 'q1', text: '' });
  expect(result.current.drafts.map((d) => d.runId)).toEqual(['r2']);
  unmount();
});

it('skips a draft frame that is not one, and does not move the replay cursor', async () => {
  vi.stubGlobal('EventSource', Stream);
  const { result } = renderHook(() =>
    useChatThread({
      selected: 'c1',
      userId: 'alice',
      isAuthenticated: true,
      setError: noError,
      setConversations: noConversations
    })
  );
  await act(async () => {});
  const stream = Stream.instances[0];
  act(() => {
    stream.dispatchEvent(new MessageEvent('draft', { data: 'not json' }));
    stream.dispatchEvent(new MessageEvent('draft', { data: JSON.stringify({ runId: 1, messageId: 'q', text: 'x' }) }));
    stream.dispatchEvent(new MessageEvent('draft', { data: JSON.stringify({ runId: 'r', messageId: 'q' }) }));
  });
  expect(result.current.drafts).toEqual([]);
  act(
    () =>
      void stream.dispatchEvent(
        new MessageEvent('draft', { data: JSON.stringify({ runId: 'r', messageId: 'q', text: 'Hi' }) })
      )
  );
  // Nothing about a draft is replayed: a reconnect asks for messages after the last one, not after a draft.
  act(() => stream.dispatchEvent(new Event('error')));
  expect(result.current.drafts).toHaveLength(1);
});

it('forgets drafts when the conversation changes', async () => {
  vi.stubGlobal('EventSource', Stream);
  const { result, rerender } = renderHook(
    ({ selected }) =>
      useChatThread({
        selected,
        userId: 'alice',
        isAuthenticated: true,
        setError: noError,
        setConversations: noConversations
      }),
    { initialProps: { selected: 'c1' } }
  );
  await act(async () => {});
  act(
    () =>
      void Stream.instances[0].dispatchEvent(
        new MessageEvent('draft', { data: JSON.stringify({ runId: 'r', messageId: 'q', text: 'Hi' }) })
      )
  );
  expect(result.current.drafts).toHaveLength(1);
  rerender({ selected: 'c2' });
  await act(async () => {});
  expect(result.current.drafts).toEqual([]);
});

it('retains mutation patches that arrive before the HTTP snapshot so unsent text never reappears', async () => {
  vi.stubGlobal('EventSource', Stream);
  let finish!: (rows: never) => void;
  vi.mocked(chatService.messages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const setError = vi.fn(),
    setConversations = vi.fn();
  const { result } = renderHook(() =>
    useChatThread({ selected: 'c1', userId: 'alice', isAuthenticated: true, setError, setConversations })
  );
  act(() =>
    Stream.instances[0].dispatchEvent(
      new MessageEvent('message-updates', {
        data: JSON.stringify([{ _id: 'm1', revision: 1, unsentAt: '2026-11-10T12:00:00Z', reactions: [] }])
      })
    )
  );
  await act(async () =>
    finish([{ _id: 'm1', seq: 1, kind: 'person', senderName: 'Alice', body: 'Secret original', evidence: [] }] as never)
  );
  expect(result.current.messages[0]).toMatchObject({ body: '', revision: 1, unsentAt: expect.any(String) });
});
