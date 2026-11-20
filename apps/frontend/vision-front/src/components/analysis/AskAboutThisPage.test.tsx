import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ isAuthenticated: true }));
const config = vi.hoisted(() => ({ SHELL_FRONT_URL: undefined as string | undefined }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../config/ConfigProvider', () => ({ useConfig: () => config }));

import AskAboutThisPage from './AskAboutThisPage';

beforeEach(() => {
  auth.isAuthenticated = true;
  config.SHELL_FRONT_URL = undefined;
});
afterEach(() => document.getElementById('shell-root')?.remove());

describe('AskAboutThisPage', () => {
  it('opens Vivi beside the page, through the shell, naming it and nothing more', async () => {
    document.body.append(Object.assign(document.createElement('div'), { id: 'shell-root' }));
    window.history.replaceState(null, '', '/datasets/d1?tab=images');
    const seen: unknown[] = [];
    window.addEventListener('visin:open-chat', (event) => seen.push((event as CustomEvent).detail), { once: true });
    render(<AskAboutThisPage title="Road scenes" />);

    await userEvent.click(screen.getByRole('button', { name: 'Ask Vivi about this' }));

    // No project, run or paper id: the page's own address says what it is, and is read as the person asking. It goes
    // with the request, for a chat that opens in place of the page (a phone) and cannot see it.
    expect(seen).toEqual([{ kind: 'assistant', title: 'Road scenes', page: '/datasets/d1?tab=images' }]);
  });

  it('outside the shell, goes to the shell\'s chat with the page named in the address', async () => {
    config.SHELL_FRONT_URL = 'https://app.example.test';
    window.history.replaceState(null, '', '/suites/road/2');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/suites/road/2', search: '', assign });
    try {
      render(<AskAboutThisPage title="Road test" />);
      await userEvent.click(screen.getByRole('button', { name: 'Ask Vivi about this' }));
      const url = new URL(assign.mock.calls[0][0] as string);
      expect(url.origin + url.pathname).toBe('https://app.example.test/chat');
      expect(url.searchParams.get('page')).toBe('/suites/road/2');
      expect(url.searchParams.get('title')).toBe('Road test');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('takes another label', () => {
    render(<AskAboutThisPage title="x" label="Ask about this dataset" />);
    expect(screen.getByRole('button', { name: 'Ask about this dataset' })).toBeInTheDocument();
  });

  it('is for someone signed in, since chat is', () => {
    auth.isAuthenticated = false;
    const { container } = render(<AskAboutThisPage title="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
