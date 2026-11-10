import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_OPEN_EVENT, LOGOUT_EVENT, beforeLogout, internalPath, useNotificationNavigation } from './notifications';

describe('internalPath', () => {
  it.each(['/chat', '/chat?conversation=64b1f0c2a3b4c5d6e7f80912', '/projects/x#tab'])('accepts %s', (value) => {
    expect(internalPath(value)).toBe(value);
  });

  it.each(['https://evil.example.test/', '//evil.example.test', '/\\evil.example.test', 'chat', '', null, 3, {}])(
    'refuses %j: the worker’s message is not allowed to send the page elsewhere',
    (value) => {
      expect(internalPath(value)).toBeNull();
    }
  );
});

describe('beforeLogout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns at once when nobody has anything to finish', async () => {
    await expect(beforeLogout()).resolves.toBeUndefined();
  });

  it('waits for what chat asks to finish first', async () => {
    let finished = false;
    const listener = (event: Event) =>
      (event as CustomEvent<{ tasks: Promise<unknown>[] }>).detail.tasks.push(
        new Promise<void>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve();
          }, 500)
        )
      );
    window.addEventListener(LOGOUT_EVENT, listener);
    const done = beforeLogout();
    await vi.advanceTimersByTimeAsync(500);
    await done;
    window.removeEventListener(LOGOUT_EVENT, listener);
    expect(finished).toBe(true);
  });

  it('never holds sign-out for more than a few seconds, nor fails over a task that fails', async () => {
    const hang = () =>
      window.addEventListener(
        LOGOUT_EVENT,
        (event) => (event as CustomEvent<{ tasks: Promise<unknown>[] }>).detail.tasks.push(new Promise(() => undefined)),
        { once: true }
      );
    hang();
    let settled = false;
    const done = beforeLogout().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(2900);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(settled).toBe(true);

    window.addEventListener(
      LOGOUT_EVENT,
      (event) => (event as CustomEvent<{ tasks: Promise<unknown>[] }>).detail.tasks.push(Promise.reject(new Error('x'))),
      { once: true }
    );
    await expect(beforeLogout()).resolves.toBeUndefined();
  });
});

describe('useNotificationNavigation', () => {
  const worker = new EventTarget();
  const tell = (data: unknown) => act(() => void worker.dispatchEvent(new MessageEvent('message', { data })));
  const opened: unknown[] = [];
  const onOpen = (event: Event) => opened.push((event as CustomEvent).detail);

  function Where() {
    useNotificationNavigation();
    const location = useLocation();
    return <p>at {location.pathname + location.search}</p>;
  }

  beforeEach(() => {
    opened.length = 0;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
    window.addEventListener(CHAT_OPEN_EVENT, onOpen);
  });
  afterEach(() => {
    window.removeEventListener(CHAT_OPEN_EVENT, onOpen);
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('routes the page in place when a notification is tapped, and tells an open chat which conversation', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Where />
      </MemoryRouter>
    );
    tell({ type: 'NAVIGATE', url: '/chat?conversation=64b1f0c2a3b4c5d6e7f80912' });
    expect(screen.getByText('at /chat?conversation=64b1f0c2a3b4c5d6e7f80912')).toBeInTheDocument();
    expect(opened).toEqual(['64b1f0c2a3b4c5d6e7f80912']);
  });

  it('does not announce a conversation for a link that names none', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Where />
      </MemoryRouter>
    );
    tell({ type: 'NAVIGATE', url: '/trainings' });
    expect(screen.getByText('at /trainings')).toBeInTheDocument();
    expect(opened).toEqual([]);
  });

  it('ignores other messages and addresses outside the app', () => {
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Where />
      </MemoryRouter>
    );
    tell({ type: 'SOMETHING_ELSE', url: '/chat' });
    tell({ type: 'NAVIGATE', url: 'https://evil.example.test/' });
    tell({ type: 'NAVIGATE', url: '//evil.example.test' });
    tell(undefined);
    expect(screen.getByText('at /projects')).toBeInTheDocument();
  });

  it('stops listening when unmounted, and is harmless where there is no service worker', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Where />
      </MemoryRouter>
    );
    unmount();
    tell({ type: 'NAVIGATE', url: '/chat' });
    expect(opened).toEqual([]);
    Reflect.deleteProperty(navigator, 'serviceWorker');
    expect(() =>
      render(
        <MemoryRouter>
          <Where />
        </MemoryRouter>
      )
    ).not.toThrow();
  });
});
