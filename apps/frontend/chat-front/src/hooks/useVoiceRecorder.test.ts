import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceRecorder } from './useVoiceRecorder';
import { MAX_VOICE_MS } from '../services/voice';

/** Records "voice" and stops on request, or when the test ends it as a browser would. */
class FakeRecorder {
  static last: FakeRecorder | null = null;
  static fail = false;
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    if (FakeRecorder.fail) throw new Error('not supported');
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) });
    queueMicrotask(() => this.onstop?.());
  }
}

/** A microphone whose loudness the test sets. */
let loudness = 0;
const closed = vi.fn();
class FakeAudioContext {
  createAnalyser() {
    return {
      fftSize: 0,
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128 + Math.round(loudness * 127))
    };
  }
  createMediaStreamSource() {
    return { connect: () => {} };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    closed();
    return Promise.resolve();
  }
}

let ended: (() => void) | null = null;
const track = {
  stop: vi.fn(),
  addEventListener: (_type: string, listener: () => void) => {
    ended = listener;
  }
};
const getUserMedia = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  loudness = 0;
  ended = null;
  FakeRecorder.fail = false;
  track.stop.mockClear();
  closed.mockClear();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The recorder's stop arrives a microtask later, and the hand-over a few after that. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

const recording = async (onEnded = vi.fn()) => {
  const hook = renderHook(() => useVoiceRecorder(onEnded));
  await act(() => hook.result.current.start());
  expect(hook.result.current.state).toBe('recording');
  return { ...hook, onEnded };
};

describe('useVoiceRecorder', () => {
  it('measures how loud the microphone is, and lets go of it at the end', async () => {
    const { result } = await recording();

    loudness = 0.2;
    void act(() => vi.advanceTimersByTime(300));

    expect(result.current.levels.length).toBeGreaterThan(0);
    expect(result.current.levels.at(-1)).toBeGreaterThan(0.5);
    expect(result.current.elapsedMs).toBe(300);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await result.current.stop();
    });
    expect(closed).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(result.current.levels).toEqual([]);
  });

  it('stops at the limit and hands the recording over to be sent', async () => {
    const { onEnded } = await recording();

    await act(async () => {
      vi.advanceTimersByTime(MAX_VOICE_MS + 100);
    });

    await settle();
    expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ durationMs: MAX_VOICE_MS }), 'limit');
  });

  it('keeps what was said when the microphone goes away', async () => {
    const { onEnded } = await recording();

    void act(() => vi.advanceTimersByTime(3000));
    await act(async () => ended?.());

    await settle();
    expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 3000 }), 'interrupted');
  });

  it('drops a slip of a tap rather than sending a blank', async () => {
    const { result } = await recording();

    let kept: unknown = 'unset';
    await act(async () => {
      kept = await result.current.stop();
    });

    expect(kept).toBeNull();
  });

  it('says so when there is no microphone to reach', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('none'), { name: 'NotFoundError' }));
    const { result } = renderHook(() => useVoiceRecorder(vi.fn()));

    await act(() => result.current.start());

    expect(result.current.error).toBe('Could not reach a microphone.');
    void act(() => vi.advanceTimersByTime(6000));
    expect(result.current.error).toBeNull();
  });

  it('lets go of the microphone when the recorder cannot start', async () => {
    FakeRecorder.fail = true;
    const { result } = renderHook(() => useVoiceRecorder(vi.fn()));

    await act(() => result.current.start());

    expect(result.current.error).toBe('Could not start recording.');
    expect(result.current.state).toBe('idle');
    expect(track.stop).toHaveBeenCalled();
  });

  it('lets go of a microphone that arrives after the recording was cancelled', async () => {
    let grant: (stream: unknown) => void = () => {};
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const { result } = renderHook(() => useVoiceRecorder(vi.fn()));

    act(() => void result.current.start());
    act(() => result.current.cancel());
    await act(async () => grant({ getTracks: () => [track] }));

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});
