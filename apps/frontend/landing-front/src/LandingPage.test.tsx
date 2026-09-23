import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LandingPage from './LandingPage';
import { ASK_CONVERSATION, ASSISTANT_LIMITS, CONNECT_STEPS, GITHUB_URL, PHONE_SCREENS, SHOWCASE } from './content';

const config: { SHELL_FRONT_URL?: string; MCP_PUBLIC_URL?: string } = {
  SHELL_FRONT_URL: 'http://shell.test',
  MCP_PUBLIC_URL: 'https://mcp.example.test'
};

vi.mock('./config/ConfigProvider', () => ({
  useConfig: () => config
}));

beforeEach(() => {
  vi.restoreAllMocks();
  config.SHELL_FRONT_URL = 'http://shell.test';
  config.MCP_PUBLIC_URL = 'https://mcp.example.test';
});

describe('LandingPage structure', () => {
  it('renders every section landmark', () => {
    const { container } = render(<LandingPage />);

    for (const id of ['top', 'product', 'mobile', 'assistant', 'open-source']) {
      expect(container.querySelector(`#${id}`)).toBeInTheDocument();
    }
    expect(container.querySelector('main#main')).toBeInTheDocument();
    expect(container.querySelector('footer')).toBeInTheDocument();
  });

  it('shows the product before it explains anything', () => {
    // Real screens first, then the phone, then the assistant: the page leads
    // with what Visin looks like rather than paragraphs about it.
    const { container } = render(<LandingPage />);

    const sections = [...container.querySelectorAll('main section')].map(s => s.id);
    expect(sections).toEqual(['top', 'product', 'mobile', 'assistant', 'open-source']);
  });

  it('leads with the headline and the product summary', () => {
    render(<LandingPage />);

    expect(screen.getByRole('heading', { level: 1, name: /a clear view of your computer vision work/i })).toBeInTheDocument();
  });

  it('plays the recorded tour, with its still frame as the poster', () => {
    const { container } = render(<LandingPage />);

    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', '/showcase/tour.webm');
    expect(video).toHaveAttribute('poster', '/showcase/tour-poster.webp');
    // Muted and inline, or phones refuse to autoplay it.
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('loop');
  });

  it('does not autoplay for someone who asked for less motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn()
      })
    });
    try {
      const { container } = render(<LandingPage />);

      expect(container.querySelector('video')).not.toHaveAttribute('autoplay');
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('shows every product screen and phone screen with its description', () => {
    render(<LandingPage />);

    for (const item of SHOWCASE) {
      expect(screen.getByRole('img', { name: item.alt })).toHaveAttribute('src', item.src);
      expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument();
      expect(screen.getByText(item.caption)).toBeInTheDocument();
    }
    for (const phone of PHONE_SCREENS) {
      expect(screen.getByRole('img', { name: phone.alt })).toHaveAttribute('src', phone.src);
    }
  });

  it('renders the assistant section from the content module', () => {
    render(<LandingPage />);

    for (const turn of ASK_CONVERSATION) {
      expect(screen.getByText(turn.text)).toBeInTheDocument();
    }
    for (const step of CONNECT_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
    for (const limit of ASSISTANT_LIMITS) {
      expect(screen.getByText(limit.body)).toBeInTheDocument();
    }
  });

  it('reads as a conversation, with both sides present and in order', () => {
    // The section's whole claim is that the assistant answers from the record,
    // so a transcript missing either half of it is missing the point.
    render(<LandingPage />);

    const asked = ASK_CONVERSATION.filter((turn) => turn.from === 'you');
    const answered = ASK_CONVERSATION.filter((turn) => turn.from === 'visin');

    expect(asked.length).toBeGreaterThan(0);
    expect(answered.length).toBe(asked.length);

    const body = document.body.textContent ?? '';
    let cursor = -1;
    for (const turn of ASK_CONVERSATION) {
      const at = body.indexOf(turn.text);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('shows what the assistant read to answer, not only what it said', () => {
    render(<LandingPage />);

    for (const turn of ASK_CONVERSATION) {
      if (turn.via) expect(screen.getByText(turn.via)).toBeInTheDocument();
    }
  });

  it("shows the endpoint someone actually has to paste, from this deployment's config", () => {
    render(<LandingPage />);

    expect(screen.getByText('https://mcp.example.test/mcp')).toBeInTheDocument();
  });

  // Self-hosted on its operator's domain: with no MCP server configured there is
  // no real address to show, and a borrowed one would point at someone else's.
  it('shows no endpoint when the deployment has not configured an MCP server', () => {
    config.MCP_PUBLIC_URL = undefined;
    render(<LandingPage />);

    expect(screen.queryByText('MCP endpoint')).not.toBeInTheDocument();
  });

  it('says what the assistant cannot do, not only what it can', () => {
    // Someone who connects one expecting to show it an image should find out
    // here rather than after wiring it up.
    render(<LandingPage />);

    expect(screen.getByText(/where it stops/i)).toBeInTheDocument();
    // It can see rendered frames; raw dataset images it still cannot, and
    // saying which is which is the point of the section.
    expect(screen.getByText(/not your raw dataset images/i)).toBeInTheDocument();
    expect(screen.getByText(/does not make them/i)).toBeInTheDocument();
  });

  it('sends the hero call-to-action to the assistant section', () => {
    render(<LandingPage />);

    expect(screen.getByRole('link', { name: /connect an assistant/i })).toHaveAttribute(
      'href',
      '#assistant'
    );
  });

  it('offers a skip link before the navigation', () => {
    render(<LandingPage />);

    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main');
  });
});

describe('LandingPage calls to action', () => {
  it('points every app link at shell-front, where the apps open', () => {
    render(<LandingPage />);

    const appLinks = screen.getAllByRole('link', { name: /open the app/i });
    expect(appLinks.length).toBeGreaterThan(1);
    for (const link of appLinks) {
      expect(link).toHaveAttribute('href', 'http://shell.test');
    }
  });

  it('falls back to a harmless href when the app URL is unconfigured', () => {
    config.SHELL_FRONT_URL = undefined;
    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: /open the app/i })[0]).toHaveAttribute('href', '#');
  });

  it('opens GitHub links in a new tab with rel protection', () => {
    render(<LandingPage />);

    const githubLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith(GITHUB_URL));

    expect(githubLinks.length).toBeGreaterThan(0);
    for (const link of githubLinks) {
      expect(link).toHaveAttribute('target', '_blank');
      // Without noopener the opened page can reach back through window.opener.
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('anchors the nav to the sections on the page', () => {
    render(<LandingPage />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Product' })).toHaveAttribute('href', '#product');
    expect(within(nav).getByRole('link', { name: 'Assistant' })).toHaveAttribute('href', '#assistant');
    expect(within(nav).getByRole('link', { name: 'Self-hosting' })).toHaveAttribute('href', '#open-source');
    // The old sections are gone; nothing may still point at where they were.
    expect(within(nav).queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Features' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'How it works' })).not.toBeInTheDocument();
  });
});

describe('LandingPage mobile menu', () => {
  // The drawer unmounts after its close transition, so closure is awaited.
  const expectDrawerClosed = () =>
    waitFor(() => expect(screen.queryByRole('button', { name: /close menu/i })).not.toBeInTheDocument());

  it('opens and closes the drawer', async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const drawer = screen.getByRole('presentation');
    expect(within(drawer).getByRole('link', { name: 'Product' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    await expectDrawerClosed();
  });

  it('closes the drawer when a link inside it is followed', async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(within(screen.getByRole('presentation')).getByRole('link', { name: 'Product' }));

    await expectDrawerClosed();
  });

  it('closes the drawer on Escape', async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape', code: 'Escape' });

    await expectDrawerClosed();
  });

  it('closes the drawer when the app link inside it is followed', async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    const drawer = screen.getByRole('presentation');
    fireEvent.click(within(drawer).getByRole('link', { name: /open the app/i }));

    await expectDrawerClosed();
  });
});

describe('LandingPage claims', () => {
  it('states the licence and the current year in the footer', () => {
    render(<LandingPage />);

    expect(screen.getByText(new RegExp(`${new Date().getFullYear()}.*MIT`))).toBeInTheDocument();
  });

  it('does not load imagery from a third-party host', () => {
    const { container } = render(<LandingPage />);

    // The old page pulled feature photos from a stock-image CDN on every visit.
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('src')).toMatch(/^\//);
    }
    expect(container.innerHTML).not.toContain('unsplash');
  });
});
