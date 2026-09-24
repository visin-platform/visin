import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

vi.mock('../config/ConfigProvider', () => ({
  useConfig: () => ({ SHELL_FRONT_URL: 'http://shell.test' })
}));

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
  it('shows the landing page at the root', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /a clear view of your computer vision work/i })
    ).toBeInTheDocument();
  });

  it('shows the landing page at any address that is not the docs, as before there were routes', () => {
    window.history.pushState({}, '', '/anything');
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: /a clear view of your computer vision work/i })
    ).toBeInTheDocument();
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
