import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

const config = vi.hoisted(() => ({ SHELL_FRONT_URL: 'http://shell.test' as string | undefined }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config }));

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
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

const { redirectTo } = vi.hoisted(() => ({ redirectTo: vi.fn() }));
vi.mock('../redirect', () => ({ redirectTo }));

beforeEach(() => {
  config.SHELL_FRONT_URL = 'http://shell.test';
  redirectTo.mockClear();
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});

describe('App routes', () => {
  const pitch = () =>
    screen.queryByRole('heading', { level: 1, name: /a clear view of your computer vision work/i });

  it('shows the landing page at / even when the shell address is configured', () => {
    render(<App />);

    expect(redirectTo).not.toHaveBeenCalled();
    expect(pitch()).toBeInTheDocument();
  });

  it('keeps the pitch at the front page of a deployment with no app to send anyone to', () => {
    config.SHELL_FRONT_URL = undefined;
    render(<App />);

    expect(redirectTo).not.toHaveBeenCalled();
    expect(pitch()).toBeInTheDocument();
  });

  it('shows the pitch at /about', () => {
    window.history.pushState({}, '', '/about');
    render(<App />);

    expect(pitch()).toBeInTheDocument();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('shows the pitch at any other address that is not the docs, as before there were routes', () => {
    window.history.pushState({}, '', '/anything');
    render(<App />);

    expect(pitch()).toBeInTheDocument();
  });

  it('loads the docs under /docs', async () => {
    // Compiling the docs chunk (Markdown and highlighting) outlasts findBy's
    // one-second default, so it is loaded before the route asks for it.
    await import('../docs/DocsApp');
    window.scrollTo = vi.fn();
    window.history.pushState({}, '', '/docs/quickstart');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Quickstart' }, { timeout: 5000 })).toBeInTheDocument();
  });
});
