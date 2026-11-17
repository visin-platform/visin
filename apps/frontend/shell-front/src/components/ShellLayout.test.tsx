import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { clearVisits, recordVisit } from '@visin/frontend-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

const authState = {
  user: { id: 'u1', name: 'Jane Doe', email: 'jane@example.com' } as { id: string; name: string; email: string } | null,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
};
vi.mock('../hooks/useGuestVivi', () => ({ useGuestVivi: () => false }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

const config: Record<string, string | undefined> = {};
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
let analystAdmin = false;
vi.mock('../hooks/useCanConfigureAnalyst', () => ({ useCanConfigureAnalyst: () => analystAdmin }));
let platformAdmin = false;
vi.mock('../hooks/useIsPlatformAdmin', () => ({ useIsPlatformAdmin: () => platformAdmin }));
let publicHandle: string | undefined;
vi.mock('../hooks/usePublicHandle', () => ({ usePublicHandle: () => publicHandle }));
vi.mock('../remotes', () => ({ remoteChatPanel: () => () => <div>Embedded conversations</div>, forgetChatPanel: vi.fn() }));

import ShellLayout from './ShellLayout';
import { ChatProvider } from './chat/ChatDock';

const Path = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ShellLayout>
          <Path />
        </ShellLayout>
      </MemoryRouter>
    </QueryClientProvider>
  );

const main = () => within(screen.getByRole('navigation', { name: 'Main' }));
const sectionBar = (name: string) => within(screen.getByRole('navigation', { name }));

beforeEach(() => {
  clearVisits();
  vi.clearAllMocks();
  authState.isAuthenticated = true;
  authState.isLoading = false;
  analystAdmin = false;
  for (const key of Object.keys(config)) delete config[key];
  config.VISION_FRONT_URL = 'https://vision.test';
});

describe('ShellLayout', () => {
  it('groups every app into Home, Projects, Data, Papers and Labels, routed inside the page', () => {
    renderAt('/projects');

    for (const [name, href] of [
      ['Home', '/'],
      ['Projects', '/projects'],
      ['Data', '/datasets'],
      ['Papers', '/papers'],
      ['Labels', '/jobs'],
    ]) {
      expect(main().getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('opens a signed-in session at Home, first in the menu', () => {
    renderAt('/');

    const groups = main().getAllByRole('link', { name: /^(Home|Projects|Data|Leaderboards|Papers|Labels)$/ });
    expect(groups.map((link) => link.textContent)).toEqual(['Home', 'Projects', 'Data', 'Papers', 'Labels']);
    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
    expect(sectionBar('Home').getByRole('link', { name: 'For you' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Explore one tab over from a member home', () => {
    renderAt('/explore');

    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
    expect(sectionBar('Home').getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
  });

  it('takes the logo home', () => {
    renderAt('/jobs');

    fireEvent.click(main().getByRole('link', { name: 'Visin home' }));

    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('opens a visitor on Explore, with nothing in the menu that needs an account', () => {
    authState.isAuthenticated = false;
    renderAt('/');

    const groups = main().getAllByRole('link', { name: /^(Explore|Home|Projects|Data|Leaderboards|Papers|Labels)$/ });
    expect(groups.map((link) => link.textContent)).toEqual(['Explore', 'Projects', 'Data', 'Papers']);
    expect(main().getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'true');
    expect(main().queryByRole('link', { name: 'Labels' })).not.toBeInTheDocument();
  });

  it('puts the public results in the top bar beside Explore, not in the rail', () => {
    renderAt('/leaderboards');

    expect(main().queryByRole('link', { name: 'Leaderboards' })).not.toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
    expect(
      sectionBar('Home')
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['For you', 'Explore', 'Leaderboards']);
    expect(sectionBar('Home').getByRole('link', { name: 'Leaderboards' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the Home tab lit on a leaderboard\'s own pages', () => {
    renderAt('/leaderboards/road-test/1/e1');

    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
    expect(sectionBar('Home').getByRole('link', { name: 'Leaderboards' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks the labeling group current, with no section bar for its single section', () => {
    renderAt('/jobs');

    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('navigation', { name: 'Labels' })).not.toBeInTheDocument();
  });

  it('highlights the group being shown', () => {
    renderAt('/jobs/j1');

    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('aria-current', 'true');
    expect(main().getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Projects highlighted on the pages a project leads to', () => {
    for (const path of ['/comparisons/c1', '/benchmarks', '/visualizations/compare']) {
      const { unmount } = renderAt(path);
      expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'true');
      unmount();
    }
  });

  it('lists Account sections, and titles the page from them, on an Account route', () => {
    renderAt('/account/groups');

    expect(sectionBar('Account').getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
  });

  it("offers Account's Analyst section to administrators only, and never to a visitor", () => {
    renderAt('/account/profile');
    expect(sectionBar('Account').queryByRole('link', { name: 'Analyst' })).not.toBeInTheDocument();
    cleanup();

    analystAdmin = true;
    renderAt('/account/profile');
    expect(sectionBar('Account').getByRole('link', { name: 'Analyst' })).toHaveAttribute('href', '/account/analyst');
    cleanup();

    authState.isAuthenticated = false;
    renderAt('/explore');
    expect(screen.queryByRole('link', { name: 'Analyst' })).not.toBeInTheDocument();
  });

  it('keeps the account menu short: Account settings, plus Administration for platform administrators only', () => {
    config.ADMIN_FRONT_URL = 'https://admin.example.test';
    const menuNames = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Account' }));
      return within(screen.getByRole('menu', { name: 'Account' }))
        .getAllByRole('menuitem')
        .map((item) => item.textContent);
    };
    try {
      renderAt('/projects');
      expect(menuNames()).toEqual(['JJane Doejane@example.com', 'Account settings', 'Sign out']);
      cleanup();

      platformAdmin = true;
      publicHandle = 'test-user';
      renderAt('/projects');
      expect(menuNames()).toEqual([
        'JJane Doejane@example.com',
        'Your public page',
        'Account settings',
        'Administration',
        'Sign out'
      ]);
      expect(screen.getByRole('menuitem', { name: 'Administration' })).toHaveAttribute(
        'href',
        'https://admin.example.test/'
      );
      expect(screen.getByRole('menuitem', { name: 'Your public page' })).toHaveAttribute('href', '/u/test-user');
    } finally {
      platformAdmin = false;
      publicHandle = undefined;
      delete config.ADMIN_FRONT_URL;
    }
  });

  it('keeps Account sections out of the section bar elsewhere', () => {
    renderAt('/projects');

    expect(screen.queryByRole('navigation', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('frames each app as its standalone front did', () => {
    renderAt('/jobs');
    expect(screen.getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();
  });

  it('leaves the title to Vision pages and to the workbench', () => {
    const { unmount } = renderAt('/projects');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    unmount();

    renderAt('/jobs/j1/work');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('draws no app header on a path no app owns', () => {
    renderAt('/nowhere');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('opens an Account section from the account menu without leaving the page', () => {
    renderAt('/projects');

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Account settings' }));

    expect(screen.getByTestId('path')).toHaveTextContent('/account/profile');
  });

  it('lets chat let go of this device before the session ends, and then signs out', async () => {
    const order: string[] = [];
    const letGo = (event: Event) => {
      (event as CustomEvent<{ tasks: Promise<unknown>[] }>).detail.tasks.push(
        Promise.resolve().then(() => void order.push('device released'))
      );
    };
    window.addEventListener('visin:logout', letGo);
    authState.logout.mockImplementation(() => void order.push('signed out'));
    renderAt('/projects');

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    await vi.waitFor(() => expect(authState.logout).toHaveBeenCalledTimes(1));
    window.removeEventListener('visin:logout', letGo);
    expect(order).toEqual(['device released', 'signed out']);
  });

  describe('top bar', () => {
    it('offers a visitor Sign in and Sign up, and the docs when the landing site is known', () => {
      authState.isAuthenticated = false;
      config.LANDING_FRONT_URL = 'https://landing.test/';
      renderAt('/projects');

      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

      expect(authState.login).toHaveBeenCalledTimes(1);
      expect(authState.signup).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://landing.test/docs');
      expect(screen.getByRole('link', { name: 'What is Visin?' })).toHaveAttribute('href', 'https://landing.test/about');
      expect(screen.getByRole('link', { name: 'What is Visin?' })).toHaveTextContent('What is Visin?');
    });

    it('links to no docs without a landing address, rather than guessing one', () => {
      authState.isAuthenticated = false;
      renderAt('/projects');

      expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    });

    it('shows the docs and GitHub as icons in the bar for a member, and the pitch page in words as well for a visitor', () => {
      config.LANDING_FRONT_URL = 'https://landing.test';
      const { unmount } = renderAt('/projects');

      for (const [name, href] of [
        ['Docs', 'https://landing.test/docs'],
        ['GitHub', 'https://github.com/visin-platform']
      ]) {
        const link = screen.getByRole('link', { name });
        expect(link).toHaveAttribute('href', href);
        expect(link).toHaveAttribute('title', name);
        expect(link).not.toHaveTextContent(name);
      }
      expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('target', '_blank');
      expect(screen.queryByRole('link', { name: 'What is Visin?' })).not.toBeInTheDocument();
      unmount();

      authState.isAuthenticated = false;
      renderAt('/projects');
      expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/visin-platform');
      expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'What is Visin?' })).toHaveAttribute('href', 'https://landing.test/about');
      expect(screen.getByRole('link', { name: 'What is Visin?' })).toHaveTextContent('What is Visin?');
    });

    it('does not repeat them in the account menu', () => {
      config.LANDING_FRONT_URL = 'https://landing.test';
      renderAt('/projects');

      fireEvent.click(screen.getByRole('button', { name: 'Account' }));

      for (const name of ['Docs', 'About', 'What is Visin?', 'GitHub']) {
        expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
      }
    });

    it('still offers GitHub where there is no landing site to link the docs to', () => {
      renderAt('/projects');

      expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
    });

    it('shows neither Sign in nor the account menu while the session is checked', () => {
      authState.isAuthenticated = false;
      authState.isLoading = true;
      renderAt('/projects');

      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
    });

    it('gives a member a New menu of what they can create', () => {
      renderAt('/datasets');

      fireEvent.click(screen.getByRole('button', { name: 'New' }));

      expect(screen.getByRole('menuitem', { name: 'Project' })).toHaveAttribute('href', '/projects?create=1');
      expect(screen.getByRole('menuitem', { name: 'Dataset' })).toHaveAttribute('href', '/datasets?create=1');
      expect(screen.getByRole('menuitem', { name: 'Labeling job' })).toHaveAttribute('href', '/jobs/new');
      expect(screen.queryByRole('menuitem', { name: 'API key' })).not.toBeInTheDocument();
    });

    it('searches everything from the box, and from Ctrl+K, on the search page', () => {
      renderAt('/datasets');

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'night driving' } });
      fireEvent.submit(screen.getByRole('search'));

      expect(screen.getByTestId('path')).toHaveTextContent('/search');
    });

    it('offers the places this browser opened lately before anything is typed, at most six, and goes to one', () => {
      for (let index = 0; index < 8; index += 1) {
        recordVisit({ kind: index % 2 ? 'dataset' : 'project', id: `v${index}`, name: `Place ${index}`, path: `/p/${index}` }, 1000 + index);
      }
      renderAt('/account/groups');

      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      const list = screen.getByRole('list', { name: 'Recently visited' });
      expect(within(list).getAllByRole('link')).toHaveLength(6);
      expect(within(list).getAllByRole('link')[0]).toHaveTextContent('Place 7Dataset');
      fireEvent.click(within(list).getByRole('link', { name: /Place 6/ }));

      expect(screen.getByTestId('path')).toHaveTextContent('/p/6');
    });

    it('has the search box whichever services are configured, since people and groups are found elsewhere', () => {
      delete config.VISION_FRONT_URL;
      renderAt('/datasets');

      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    });
  });
});

const withClient = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('chat', () => {
  const renderWithChat = (path: string) =>
    render(
      withClient(
        <MemoryRouter initialEntries={[path]}>
          <ChatProvider>
            <ShellLayout>
              <Path />
            </ShellLayout>
          </ChatProvider>
        </MemoryRouter>
      )
    );

  it('is a button in the bar, not a place in the menu, and docks beside the page', () => {
    config.CHAT_FRONT_URL = 'https://chat.test';
    const { container } = renderWithChat('/projects');
    expect(main().queryByRole('link', { name: 'Chat' })).toBeNull();
    fireEvent.click(within(container.querySelector('header')!).getByRole('button', { name: 'Chat' }));
    const panel = screen.getByRole('complementary', { name: 'Chat' });
    expect(container.querySelector('main')!.contains(panel)).toBe(false);
  });

  it('asks for no unread count on a desktop, which draws no badge', async () => {
    config.CHAT_FRONT_URL = 'https://chat.test';
    config.CHAT_SERVICE_URL = 'https://chat-api.test';
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      renderWithChat('/projects');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is left out where chat is not configured', () => {
    renderWithChat('/projects');
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
  });
});

describe('chat on a phone', () => {
  const asPhone = () =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );
  const unread = (count: number) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true, data: { unread: count } }), { status: 200, headers: { 'content-type': 'application/json' } }))
    );
  const Back = () => {
    const navigate = useNavigate();
    return <button onClick={() => navigate(-1)}>history back</button>;
  };
  const renderPhone = (path: string, initialEntries: string[] = [path]) =>
    render(
      withClient(
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
          <ChatProvider>
            <ShellLayout>
              <Path />
            </ShellLayout>
          </ChatProvider>
          <Back />
          <Search />
        </MemoryRouter>
      )
    );
  const Search = () => <div data-testid="search">{useLocation().search}</div>;
  const detail = (open: boolean) => act(() => void window.dispatchEvent(new CustomEvent('visin:chat-detail', { detail: open })));
  const tabs = () => [...main().getAllByRole('link')].map((tab) => tab.textContent);

  beforeEach(() => {
    config.CHAT_FRONT_URL = 'https://chat.test';
    config.CHAT_SERVICE_URL = 'https://chat-api.test';
    unread(0);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('puts Chat in the middle of the tab bar, not in the top bar', () => {
    asPhone();
    const { container } = renderPhone('/projects');

    expect(tabs()).toEqual(['Home', 'Projects', 'Chat', 'Data']);
    expect(main().getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/chat');
    expect(within(container.querySelector('header')!).queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
  });

  it('says how many conversations are waiting, on the tab', async () => {
    asPhone();
    unread(3);
    renderPhone('/projects');

    expect(await main().findByRole('link', { name: 'Chat, 3 unread' })).toBeInTheDocument();
  });

  it('offers a visitor Ask Vivi in the same place, and nothing where there is no Vivi to ask', () => {
    asPhone();
    authState.isAuthenticated = false;
    authState.user = null;
    renderPhone('/projects');
    expect(main().queryByRole('link', { name: /chat|vivi/i })).not.toBeInTheDocument();
    cleanup();
    authState.isAuthenticated = true;
    authState.user = { id: 'u1', name: 'Jane Doe', email: 'jane@example.com' };
    delete config.CHAT_FRONT_URL;
    renderPhone('/projects');
    expect(main().queryByRole('link', { name: /chat|vivi/i })).not.toBeInTheDocument();
  });

  it('keeps the bars on the conversation list, with the Chat tab lit', async () => {
    asPhone();
    const { container } = renderPhone('/chat');

    expect(await screen.findByText('Embedded conversations')).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'true');
    expect(container.querySelector('header')).toHaveTextContent('Chat');
    expect(screen.queryByTestId('path')).not.toBeInTheDocument();
    expect(document.title).toBe('Chat · Visin');
  });

  it('takes the whole screen for a conversation, and the browser’s back button returns to the list', async () => {
    asPhone();
    const { container } = renderPhone('/chat');
    await screen.findByText('Embedded conversations');

    detail(true);
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?thread=1'));
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(container.querySelector('header')).toBeNull();
    // The same chat is still mounted: the conversation was not reloaded.
    expect(screen.getByText('Embedded conversations')).toBeInTheDocument();

    const listAsked = vi.fn();
    window.addEventListener('visin:chat-show-list', listAsked);
    fireEvent.click(screen.getByRole('button', { name: 'history back' }));
    await waitFor(() => expect(listAsked).toHaveBeenCalledTimes(1));
    window.removeEventListener('visin:chat-show-list', listAsked);
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);

    detail(false);
    await waitFor(() => expect(main().getByRole('link', { name: 'Chat' })).toBeInTheDocument());
  });

  it('drops the conversation’s history entry when the arrow in it goes back to the list', async () => {
    asPhone();
    renderPhone('/chat');
    await screen.findByText('Embedded conversations');
    detail(true);
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?thread=1'));

    const listAsked = vi.fn();
    window.addEventListener('visin:chat-show-list', listAsked);
    detail(false);

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    // chat-front already shows the list: it is not told again.
    expect(listAsked).not.toHaveBeenCalled();
    window.removeEventListener('visin:chat-show-list', listAsked);
    expect(main().getByRole('link', { name: 'Chat' })).toBeInTheDocument();
  });

  it('asks for the count again on leaving chat, not on every page change', async () => {
    asPhone();
    unread(1);
    const Go = () => {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate('/datasets')}>to datasets</button>
          <button onClick={() => navigate('/chat')}>to chat</button>
          <button onClick={() => navigate('/projects')}>to projects</button>
        </>
      );
    };
    render(
      withClient(
        <MemoryRouter initialEntries={['/projects']}>
          <ChatProvider>
            <ShellLayout>
              <Path />
            </ShellLayout>
          </ChatProvider>
          <Go />
        </MemoryRouter>
      )
    );
    await main().findByRole('link', { name: 'Chat, 1 unread' });
    const calls = () => (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const first = calls();

    fireEvent.click(screen.getByRole('button', { name: 'to datasets' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls()).toBe(first);

    fireEvent.click(screen.getByRole('button', { name: 'to chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'to projects' }));
    await waitFor(() => expect(calls()).toBeGreaterThan(first));
  });

  it('keeps the menus on every other page of a phone', () => {
    asPhone();
    renderPhone('/projects');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
