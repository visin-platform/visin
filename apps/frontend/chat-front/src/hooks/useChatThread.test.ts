import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ CHAT_SERVICE_URL: 'http://chat.test' }) }));
vi.mock('../services/chatService', () => ({
  chatService: { messages: vi.fn(async () => []), runs: vi.fn(async () => []), markRead: vi.fn(async () => {}) }
}));
import { chatService } from '../services/chatService';
import { useChatThread } from './useChatThread';
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
