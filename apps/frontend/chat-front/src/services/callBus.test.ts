import { describe, expect, it, vi } from 'vitest';
import { callsReady, canUseCamera, onCallRequest, requestCall, setCallsReady, watchCallsReady } from './callBus';

describe('callBus', () => {
  it('carries a call request from a thread to the call host, until the host stops listening', () => {
    const handler = vi.fn();
    const stop = onCallRequest(handler);

    requestCall({ conversationId: 'c1', peer: { userId: 'u-irja', name: 'Irja', picture: null } });
    stop();
    requestCall({ conversationId: 'c2' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ conversationId: 'c1', peer: { userId: 'u-irja', name: 'Irja', picture: null } });
  });
});

describe('callsReady', () => {
  it('tells a thread that something will answer a call button, and when that stops', () => {
    const changed = vi.fn();
    const stop = watchCallsReady(changed);
    expect(callsReady()).toBe(false);

    setCallsReady(true);
    expect(callsReady()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);

    setCallsReady(false);
    expect(callsReady()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);

    stop();
    setCallsReady(true);
    expect(changed).toHaveBeenCalledTimes(2);
    setCallsReady(false);
  });

  it('knows whether this browser can open a camera', () => {
    expect(typeof canUseCamera()).toBe('boolean');
  });
});
