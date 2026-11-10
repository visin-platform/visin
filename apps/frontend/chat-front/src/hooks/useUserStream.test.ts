import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStream } from './useUserStream';

const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'http://chat.example.test/' as string | undefined }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));

/** An EventSource the test can drive: open it, send it frames, and have the server drop it. */
class FakeSource {
  static all: FakeSource[] = [];
  static readonly CLOSED = 2;
  readyState = 0;
  closed = false;
  private listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly url: string;
  readonly init?: EventSourceInit;
  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.init = init;
    FakeSource.all.push(this);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

beforeEach(() => {
  FakeSource.all = [];
  config.CHAT_SERVICE_URL = 'http://chat.example.test/';
  vi.stubGlobal('EventSource', FakeSource);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const mount = (overrides: Partial<Parameters<typeof useUserStream>[0]> = {}) => {
  const onEvent = vi.fn();
  const onOpen = vi.fn();
  const hook = renderHook((props) => useUserStream(props), {
    initialProps: { enabled: true, deviceId: 'tab-device-1', onEvent, onOpen, ...overrides }
  });
  return { onEvent, onOpen, ...hook };
};

describe('useUserStream', () => {
  it('opens this tab’s stream with the sign-in cookie', () => {
    mount();
    expect(FakeSource.all).toHaveLength(1);
    expect(FakeSource.all[0]!.url).toBe('http://chat.example.test/api/chat/events?device=tab-device-1');
    expect(FakeSource.all[0]!.init).toEqual({ withCredentials: true });
  });

  it('does nothing while off, without an address, or where there is no EventSource', () => {
    mount({ enabled: false });
    config.CHAT_SERVICE_URL = undefined;
    mount();
    config.CHAT_SERVICE_URL = 'http://chat.example.test/';
    vi.stubGlobal('EventSource', undefined);
    mount();
    expect(FakeSource.all).toHaveLength(0);
  });

  it('hands over each call event, and catches up whenever it (re)connects', () => {
    const { onEvent, onOpen } = mount();
    const source = FakeSource.all[0]!;
    source.emit('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    const event = { type: 'call.ringing', conversationId: 'c1', at: 1, payload: { id: 'k1' } };
    source.emit('call', { data: JSON.stringify(event) });
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('ignores a frame that is not an event', () => {
    const { onEvent } = mount();
    FakeSource.all[0]!.emit('call', { data: 'not json' });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('leaves a dropped stream to the browser, which reconnects it itself', () => {
    mount();
    const source = FakeSource.all[0]!;
    source.readyState = 0; // connecting again
    source.emit('error');
    act(() => void vi.advanceTimersByTime(60_000));
    expect(FakeSource.all).toHaveLength(1);
    expect(source.closed).toBe(false);
  });

  it('opens a stream the server refused again, with a growing pause, and starts over once it works', () => {
    const { onOpen } = mount();
    const refuse = (source: FakeSource) => {
      source.readyState = FakeSource.CLOSED;
      source.emit('error');
    };
    refuse(FakeSource.all[0]!);
    act(() => void vi.advanceTimersByTime(1999));
    expect(FakeSource.all).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(2);

    refuse(FakeSource.all[1]!);
    act(() => void vi.advanceTimersByTime(3999));
    expect(FakeSource.all).toHaveLength(2);
    act(() => void vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(3);

    FakeSource.all[2]!.emit('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    refuse(FakeSource.all[2]!);
    act(() => void vi.advanceTimersByTime(2000));
    expect(FakeSource.all).toHaveLength(4);
  });

  it('never waits more than half a minute', () => {
    mount();
    for (let i = 0; i < 8; i++) {
      const source = FakeSource.all.at(-1)!;
      source.readyState = FakeSource.CLOSED;
      source.emit('error');
      act(() => void vi.advanceTimersByTime(30_000));
    }
    expect(FakeSource.all.length).toBeGreaterThan(8);
  });

  it('closes when unmounted or switched off, and does not come back on its own', () => {
    const { unmount, onEvent, onOpen } = mount();
    const source = FakeSource.all[0]!;
    source.readyState = FakeSource.CLOSED;
    source.emit('error'); // a reconnect is now pending
    unmount();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(FakeSource.all).toHaveLength(1);
    expect(source.closed).toBe(true);

    const second = mount();
    second.rerender({ enabled: false, deviceId: 'tab-device-1', onEvent, onOpen });
    expect(FakeSource.all.at(-1)!.closed).toBe(true);
  });

  it('uses the latest handlers without reopening the stream', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, onOpen } = mount({ onEvent: first });
    rerender({ enabled: true, deviceId: 'tab-device-1', onEvent: second, onOpen });
    FakeSource.all[0]!.emit('call', { data: JSON.stringify({ type: 'call.ended' }) });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(FakeSource.all).toHaveLength(1);
  });
});
