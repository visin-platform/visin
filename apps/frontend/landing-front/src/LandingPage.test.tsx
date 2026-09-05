import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LandingPage from './LandingPage';
import { ASK_EXAMPLES, ASSISTANT_LIMITS, CONNECT_STEPS, FEATURES, MCP_ENDPOINT, STEPS, GITHUB_URL } from './content';

const config: { VISION_FRONT_URL?: string } = { VISION_FRONT_URL: 'http://vision.test' };

vi.mock('./config/ConfigProvider', () => ({
  useConfig: () => config
}));
vi.mock('./ContactForm', () => ({ default: () => <div>contact-form</div> }));

beforeEach(() => {
  vi.restoreAllMocks();
  config.VISION_FRONT_URL = 'http://vision.test';
});

describe('LandingPage structure', () => {
  it('renders every section landmark', () => {
    const { container } = render(<LandingPage />);

    for (const id of ['top', 'how-it-works', 'features', 'assistant', 'open-source', 'contact']) {
      expect(container.querySelector(`#${id}`)).toBeInTheDocument();
    }
    expect(container.querySelector('main#main')).toBeInTheDocument();
    expect(container.querySelector('footer')).toBeInTheDocument();
  });

  it('puts the analysis section first, right after the hero', () => {
    // It is what the page is selling; burying it under the feature grid was
    // the old order.
    const { container } = render(<LandingPage />);

    const sections = [...container.querySelectorAll('main section')].map(s => s.id);
    expect(sections).toEqual(['top', 'assistant', 'how-it-works', 'features', 'open-source', 'contact']);
  });

  it('leads with the headline and the product summary', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /ask your training runs what actually happened/i })
    ).toBeInTheDocument();
  });

  it('renders every workflow step and feature from the content module', () => {
    render(<LandingPage />);

    for (const step of STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
    for (const feature of FEATURES) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
    }
  });

  it('renders the assistant section from the content module', () => {
    render(<LandingPage />);

    for (const example of ASK_EXAMPLES) {
      expect(screen.getByText(example.question)).toBeInTheDocument();
    }
    for (const step of CONNECT_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
    for (const limit of ASSISTANT_LIMITS) {
      expect(screen.getByText(limit.body)).toBeInTheDocument();
    }
  });

  it('shows the endpoint someone actually has to paste', () => {
    render(<LandingPage />);

    expect(screen.getByText(MCP_ENDPOINT)).toBeInTheDocument();
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

  it('mounts the contact form', () => {
    render(<LandingPage />);

    expect(screen.getByText('contact-form')).toBeInTheDocument();
  });

  it('offers a skip link before the navigation', () => {
    render(<LandingPage />);

    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main');
  });
});

describe('LandingPage calls to action', () => {
  it('points every app link at the configured Vision URL', () => {
    render(<LandingPage />);

    const appLinks = screen.getAllByRole('link', { name: /open the app/i });
    expect(appLinks.length).toBeGreaterThan(1);
    for (const link of appLinks) {
      expect(link).toHaveAttribute('href', 'http://vision.test');
    }
  });

  it('falls back to a harmless href when the app URL is unconfigured', () => {
    config.VISION_FRONT_URL = undefined;
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
    expect(within(nav).getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features');
    expect(within(nav).getByRole('link', { name: 'Analysis' })).toHaveAttribute('href', '#assistant');
    expect(within(nav).getByRole('link', { name: 'Self-hosting' })).toHaveAttribute('href', '#open-source');
    expect(within(nav).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '#contact');
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
    expect(within(drawer).getByRole('link', { name: 'Features' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    await expectDrawerClosed();
  });

  it('closes the drawer when a link inside it is followed', async () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.click(within(screen.getByRole('presentation')).getByRole('link', { name: 'Features' }));

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
