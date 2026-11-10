import { useEffect, useState } from 'react';

/** How often the shown text is brought forward: often enough to read as typing, rarely enough to spare the parser. */
const STEP_MS = 40;
/** How long text that has just arrived takes to be shown, however much of it there is. */
const CATCH_UP_MS = 400;
/** The slowest it types, in characters a millisecond (about 60 a second): a short burst is not dragged out. */
const MIN_SPEED = 0.06;

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * Text that has arrived in bursts, shown as if it were typed: a burst of a few hundred characters every quarter of a
 * second becomes a steady flow, shown within `CATCH_UP_MS` of arriving, so a long answer is never read late. Where
 * motion is reduced it is shown as it arrives. It only ever catches up: text that shrinks (a new turn) is shown at once.
 */
export function useSmoothText(target: string): string {
  const [shown, setShown] = useState(() => (reducedMotion() ? target.length : 0));

  useEffect(() => {
    if (reducedMotion() || target.length < shown) {
      setShown(target.length);
      return;
    }
    // Fixed when text arrives, so the pace is steady rather than slowing as the gap closes.
    let position = shown;
    const speed = Math.max(MIN_SPEED, (target.length - position) / CATCH_UP_MS);
    if (position >= target.length) return;
    let last = performance.now();
    // Parsing a long Markdown document every 40 ms spends time without adding useful motion.
    const step = target.length >= 10_000 ? 120 : STEP_MS;
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      let next = Math.min(target.length, position + Math.max(1, Math.round(speed * elapsed)));
      // Never stop between the two halves of a character made of two.
      const code = target.charCodeAt(next - 1);
      if (next < target.length && code >= 0xd800 && code <= 0xdbff) next += 1;
      position = next;
      setShown(next);
      if (next >= target.length) clearInterval(timer);
    }, step);
    return () => clearInterval(timer);
    // `shown` is read once, when text arrives: the timer carries its own position from there, and restarting it on
    // every step would restart the clock too.
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  return target.slice(0, Math.min(shown, target.length));
}
