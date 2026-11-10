import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSmoothText } from './useSmoothText';

const motion = (reduced: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));

beforeEach(() => {
  vi.useFakeTimers();
  motion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('useSmoothText', () => {
  it('starts empty and types a burst out over a moment, never running ahead of what arrived', () => {
    const text = 'Validation peaked at epoch 42, then the loss began to rise again.';
    const { result } = renderHook(() => useSmoothText(text));
    expect(result.current).toBe('');
    advance(80);
    expect(result.current.length).toBeGreaterThan(0);
    expect(result.current.length).toBeLessThan(text.length);
    expect(text.startsWith(result.current)).toBe(true);
    advance(600);
    expect(result.current).toBe(text);
  });

  it('keeps pace with text that keeps arriving, and is never far behind it', () => {
    const { result, rerender } = renderHook(({ text }) => useSmoothText(text), { initialProps: { text: '' } });
    let text = '';
    for (let i = 0; i < 8; i++) {
      text += 'a few more words of the answer ';
      rerender({ text });
      advance(250);
    }
    advance(500);
    expect(result.current).toBe(text);
  });

  it('shows it all at once where motion is reduced, however it arrives', () => {
    motion(true);
    const { result, rerender } = renderHook(({ text }) => useSmoothText(text), { initialProps: { text: 'Hello' } });
    expect(result.current).toBe('Hello');
    rerender({ text: 'Hello there, this is more' });
    expect(result.current).toBe('Hello there, this is more');
  });

  it('follows text that shrinks (a turn that began again) at once', () => {
    const { result, rerender } = renderHook(({ text }) => useSmoothText(text), { initialProps: { text: 'A long first turn of text.' } });
    advance(1000);
    expect(result.current).toBe('A long first turn of text.');
    rerender({ text: 'New' });
    expect(result.current).toBe('New');
  });

  it('does not stop between the two halves of a character', () => {
    const text = 'ab😀cd😀ef😀gh😀ij';
    const { result } = renderHook(() => useSmoothText(text));
    for (let i = 0; i < 40; i++) {
      advance(40);
      const shown = result.current;
      const last = shown.charCodeAt(shown.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
  });

  it('stops its timer once caught up, and when unmounted', () => {
    const { unmount } = renderHook(() => useSmoothText('short'));
    advance(1000);
    expect(vi.getTimerCount()).toBe(0);
    const again = renderHook(() => useSmoothText('another bit of text that takes a while to type'));
    advance(40);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    again.unmount();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('copes with a browser that cannot say whether motion is reduced', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unsupported');
    });
    const { result } = renderHook(() => useSmoothText('hello'));
    advance(1000);
    expect(result.current).toBe('hello');
  });
});

it('shows a 20k-character answer within one tick of the catch-up deadline with at most four parser updates', () => {
  const text = 'A long paragraph.\n\n'.repeat(1200);
  let renders = 0;
  const { result } = renderHook(() => {
    renders++;
    return useSmoothText(text);
  });
  const initialRenders = renders;
  for (let i = 0; i < 12; i++) advance(40);
  expect(result.current).toBe(text);
  expect(renders - initialRenders).toBeLessThanOrEqual(4);
  expect(vi.getTimerCount()).toBe(0);
});
