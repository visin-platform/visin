import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Just enough Web Audio to see what is played, and when it stops. */
function audioContext() {
  const resume = vi.fn(async () => undefined);
  const bursts: Array<{ frequencies: number[]; start: number; stop: number }> = [];
  class Context {
    state = 'suspended';
    currentTime = 10;
    destination = {};
    resume = resume;
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
    createOscillator() {
      const burst = { frequencies: [] as number[], start: 0, stop: 0 };
      bursts.push(burst);
      const oscillator = {
        frequency: {
          set value(frequency: number) {
            burst.frequencies.push(frequency);
          }
        },
        connect: vi.fn(),
        start: (at: number) => (burst.start = at),
        stop: (at: number) => (burst.stop = at)
      };
      return oscillator;
    }
  }
  return { Context, bursts, resume };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('playTone', () => {
  it('rings in pairs of bursts, vibrates, repeats, and stops when told', async () => {
    const { Context, bursts } = audioContext();
    vi.stubGlobal('AudioContext', Context);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { playTone } = await import('./ringtone');

    const stop = playTone('ring');
    // Two bursts, each of two tones sounded together.
    expect(bursts.map((b) => b.frequencies[0])).toEqual([440, 480, 440, 480]);
    expect(vibrate).toHaveBeenCalledWith([400, 200, 400]);

    vi.advanceTimersByTime(3000);
    expect(bursts).toHaveLength(8);

    stop();
    expect(vibrate).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(10_000);
    expect(bursts).toHaveLength(8);
  });

  it('plays a quieter, slower ringback while calling out, without vibrating', async () => {
    const { Context, bursts } = audioContext();
    vi.stubGlobal('AudioContext', Context);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { playTone } = await import('./ringtone');

    const stop = playTone('ringback');
    expect(bursts.map((b) => b.frequencies)).toEqual([[425]]);
    vi.advanceTimersByTime(3999);
    expect(bursts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(bursts).toHaveLength(2);
    stop();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('wakes a suspended audio context, and reuses it', async () => {
    const { Context, resume } = audioContext();
    vi.stubGlobal('AudioContext', Context);
    const { playTone } = await import('./ringtone');
    playTone('ringback')();
    playTone('ringback')();
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('falls back to the prefixed constructor of older Safari', async () => {
    const { Context, bursts } = audioContext();
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', Context);
    const { playTone } = await import('./ringtone');
    playTone('ringback')();
    expect(bursts).toHaveLength(1);
  });

  it('is silent, not broken, where there is no audio or the browser refuses it', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const { playTone } = await import('./ringtone');
    expect(() => playTone('ring')()).not.toThrow();

    vi.resetModules();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('blocked');
        }
      }
    );
    const again = await import('./ringtone');
    expect(() => again.playTone('ringback')()).not.toThrow();
  });
});
