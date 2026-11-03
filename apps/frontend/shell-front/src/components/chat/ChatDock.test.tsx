import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
const state = vi.hoisted(() => ({ enabled: true, authenticated: true, failed: false }));
vi.mock('../../config/ConfigProvider', () => ({
  useConfig: () => ({ CHAT_FRONT_URL: state.enabled ? 'http://chat.test' : undefined })
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: state.authenticated }) }));
vi.mock('../../remotes', () => ({
  remoteChatPanel: () =>
    function Panel() {
      if (state.failed) throw new Error('Deployment offline');
      return <div>Embedded conversations</div>;
    },
  forgetChatPanel: vi.fn()
}));
import { ChatButton, ChatProvider, ChatSidePanel } from './ChatDock';
import { clampWidth, useChatDock } from './chatDock';
import { forgetChatPanel } from '../../remotes';

/** What AppLayout does with the dock: the button in the bar, the panel beside the page. */
function Layout() {
  const dock = useChatDock();
  const location = useLocation();
  return (
    <>
      <header>
        <ChatButton />
      </header>
      <main>
        Results at {location.pathname}
        {location.search}
      </main>
      {dock.open && <ChatSidePanel />}
    </>
  );
}
const mount = (path = '/projects') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ChatProvider>
        <Layout />
      </ChatProvider>
    </MemoryRouter>
  );
const openChat = () => fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.enabled = true;
  state.authenticated = true;
  state.failed = false;
  delete window.__visinChatContext;
});

it('offers chat only when it is configured and someone is signed in', () => {
  state.enabled = false;
  const first = mount();
  expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
  first.unmount();
  state.enabled = true;
  state.authenticated = false;
  mount();
  expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
});
it('opens and closes a panel beside the page, and remembers it was open', () => {
  const first = mount();
  openChat();
  expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('complementary', { name: 'Chat' })).toBeInTheDocument();
  expect(screen.getByText('Embedded conversations')).toBeInTheDocument();
  expect(screen.getByText('Results at /projects')).toBeInTheDocument();
  first.unmount();
  mount();
  expect(screen.getByText('Embedded conversations')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
  expect(screen.queryByText('Embedded conversations')).toBeNull();
});
it('hands an explicit request to chat and opens it', () => {
  mount();
  const detail = { projectId: 'p1', trainingIds: ['t1'], title: 'Run analysis' };
  const receive = vi.fn();
  window.addEventListener('visin:chat-context', receive);
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:open-chat', { detail }));
  });
  expect(receive).toHaveBeenCalled();
  expect(screen.getByText('Embedded conversations')).toBeInTheDocument();
  expect(window.__visinChatContext).toEqual(detail);
  window.removeEventListener('visin:chat-context', receive);
});
it('opens the conversation being shown on the full chat page, and no second copy there', () => {
  mount();
  openChat();
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:chat-selected', { detail: 'c1' }));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open full chat' }));
  expect(screen.getByText('Results at /chat?conversation=c1')).toBeInTheDocument();
  expect(screen.queryByText('Embedded conversations')).toBeNull();
});
it('goes to the chat page from the button while on it, rather than opening a panel', () => {
  mount('/chat');
  openChat();
  expect(screen.queryByText('Embedded conversations')).toBeNull();
  expect(screen.getByText('Results at /chat')).toBeInTheDocument();
});
it('resizes with the keyboard and the pointer, and remembers the width', () => {
  localStorage.setItem('visin.chat.width', '400');
  mount();
  openChat();
  const separator = screen.getByRole('separator', { name: 'Resize chat' });
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(localStorage.getItem('visin.chat.width')).toBe('424');
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(localStorage.getItem('visin.chat.width')).toBe('400');
  fireEvent.keyDown(separator, { key: 'Enter' });
  const capture = vi.fn();
  separator.setPointerCapture = capture;
  fireEvent.pointerDown(separator, { pointerId: 1, clientX: 600 });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 560 });
  fireEvent.pointerUp(separator, { pointerId: 1, clientX: 560 });
  expect(capture).toHaveBeenCalled();
  expect(localStorage.getItem('visin.chat.width')).toBe('440');
  fireEvent.doubleClick(separator);
  expect(localStorage.getItem('visin.chat.width')).toBe('440');
});
it('keeps the panel within range for the window', () => {
  expect(clampWidth(100, 1600)).toBe(320);
  expect(clampWidth(2000, 1600)).toBe(720);
  expect(clampWidth(700, 1000)).toBe(500);
});
it('retries a failed remote without replacing the page', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  state.failed = true;
  mount();
  openChat();
  expect(screen.getByText(/Chat is unavailable/)).toBeInTheDocument();
  expect(screen.getByText('Results at /projects')).toBeInTheDocument();
  state.failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(forgetChatPanel).toHaveBeenCalled();
  expect(screen.getByText('Embedded conversations')).toBeInTheDocument();
  error.mockRestore();
});
it('opens the panel when asked with nothing in particular', () => {
  mount();
  act(() => {
    window.dispatchEvent(new CustomEvent('visin:open-chat'));
  });
  expect(screen.getByText('Embedded conversations')).toBeInTheDocument();
});
it('keeps working where the browser refuses storage', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  mount();
  openChat();
  expect(screen.getByText('Embedded conversations')).toBeInTheDocument();
  get.mockRestore();
  set.mockRestore();
});
it('does nothing outside a provider', () => {
  function Orphan() {
    const dock = useChatDock();
    dock.toggle();
    dock.close();
    dock.openWith({ kind: 'group', groupId: 'g1' });
    return <div>{dock.available ? 'available' : 'unavailable'}</div>;
  }
  render(<Orphan />);
  expect(screen.getByText('unavailable')).toBeInTheDocument();
});
describe('on a phone', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
  });
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('opens the chat page from the button, with no panel beside the page', () => {
    mount();
    openChat();
    expect(screen.getByText('Results at /chat')).toBeInTheDocument();
    expect(screen.queryByText('Embedded conversations')).toBeNull();
  });
  it('takes a request to the chat page, where chat picks it up', () => {
    mount();
    act(() => {
      window.dispatchEvent(new CustomEvent('visin:open-chat', { detail: { kind: 'direct', handle: 'grace' } }));
    });
    expect(screen.getByText('Results at /chat')).toBeInTheDocument();
    expect(window.__visinChatContext).toEqual({ kind: 'direct', handle: 'grace' });
  });
  it('goes to the chat page when asked with nothing in particular', () => {
    mount();
    act(() => {
      window.dispatchEvent(new CustomEvent('visin:open-chat'));
    });
    expect(screen.getByText('Results at /chat')).toBeInTheDocument();
  });
});
it('narrows itself when the window does', () => {
  localStorage.setItem('visin.chat.width', '500');
  mount();
  openChat();
  const separator = screen.getByRole('separator', { name: 'Resize chat' });
  expect(separator).toHaveAttribute('aria-valuenow', '500');
  const wide = window.innerWidth;
  act(() => {
    window.innerWidth = 800;
    window.dispatchEvent(new Event('resize'));
  });
  expect(separator).toHaveAttribute('aria-valuenow', '400');
  window.innerWidth = wide;
});
