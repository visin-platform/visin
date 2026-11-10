/**
 * The sounds of a call, made on the spot with Web Audio rather than shipped as
 * files: a ring for an incoming call and a quieter ringback while calling out.
 *
 * Best-effort by nature. A browser that has not seen a tap yet may keep the
 * audio context suspended, so an incoming call on a page nobody has touched can
 * ring silently. The notification and the vibration cover that case.
 */

type Tone = 'ring' | 'ringback';

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context ??= new Context();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

/** One burst: two frequencies together, faded in and out so it does not click. */
function beep(ctx: AudioContext, frequencies: number[], start: number, length: number, volume: number): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + length - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + length);
  gain.connect(ctx.destination);
  for (const frequency of frequencies) {
    const oscillator = ctx.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + length);
  }
}

const PATTERNS: Record<Tone, { every: number; play: (ctx: AudioContext, at: number) => void; vibrate?: number[] }> = {
  ring: {
    every: 3000,
    play: (ctx, at) => {
      beep(ctx, [440, 480], at, 0.4, 0.25);
      beep(ctx, [440, 480], at + 0.6, 0.4, 0.25);
    },
    vibrate: [400, 200, 400]
  },
  ringback: {
    every: 4000,
    play: (ctx, at) => beep(ctx, [425], at, 1, 0.08)
  }
};

/** Starts a tone, repeating until the returned function is called. */
export function playTone(tone: Tone): () => void {
  const pattern = PATTERNS[tone];
  const once = () => {
    const ctx = audio();
    if (ctx) pattern.play(ctx, ctx.currentTime + 0.05);
    if (pattern.vibrate) navigator.vibrate?.(pattern.vibrate);
  };
  once();
  const timer = setInterval(once, pattern.every);
  return () => {
    clearInterval(timer);
    if (pattern.vibrate) navigator.vibrate?.(0);
  };
}
