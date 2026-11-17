import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardAwareHeight } from './layout';

type Listener = () => void;

function stubViewport(height: number, scale = 1) {
  const listeners = new Map<string, Set<Listener>>();
  const viewport = {
    height,
    scale,
    addEventListener: (name: string, fn: Listener) => listeners.set(name, (listeners.get(name) ?? new Set()).add(fn)),
    removeEventListener: (name: string, fn: Listener) => listeners.get(name)?.delete(fn)
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  return {
    resize(next: number) {
      viewport.height = next;
      listeners.get('resize')?.forEach((fn) => fn());
    },
    listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0)
  };
}

const frame = () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))));

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  vi.restoreAllMocks();
});

describe('useKeyboardAwareHeight', () => {
  it('is the whole screen while no keyboard is up', async () => {
    stubViewport(800);
    const { result } = renderHook(() => useKeyboardAwareHeight());
    await frame();

    expect(result.current).toBe('100dvh');
  });

  it('shrinks to what is above the keyboard, and returns when it goes', async () => {
    const viewport = stubViewport(800);
    const { result } = renderHook(() => useKeyboardAwareHeight());

    viewport.resize(480);
    await frame();
    expect(result.current).toBe('480px');

    viewport.resize(800);
    await frame();
    expect(result.current).toBe('100dvh');
  });

  it('takes a few dozen pixels of browser chrome for no keyboard at all', async () => {
    const viewport = stubViewport(800);
    const { result } = renderHook(() => useKeyboardAwareHeight());

    viewport.resize(750);
    await frame();

    expect(result.current).toBe('100dvh');
  });

  it('does not fight a pinch zoom', async () => {
    const viewport = stubViewport(800, 2);
    const { result } = renderHook(() => useKeyboardAwareHeight());

    viewport.resize(300);
    await frame();

    expect(result.current).toBe('100dvh');
  });

  it('listens to nothing while it is off, and stops when it is unmounted', () => {
    const viewport = stubViewport(800);
    const off = renderHook(() => useKeyboardAwareHeight(false));
    expect(viewport.listening()).toBe(0);
    off.unmount();

    const on = renderHook(() => useKeyboardAwareHeight(true));
    expect(viewport.listening()).toBe(2);
    on.unmount();
    expect(viewport.listening()).toBe(0);
  });

  it('is plain 100dvh where there is no visual viewport', () => {
    const { result } = renderHook(() => useKeyboardAwareHeight());

    expect(result.current).toBe('100dvh');
  });
});
