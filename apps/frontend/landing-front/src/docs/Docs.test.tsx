import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DocsApp from './DocsApp';
import DocsPage from './DocsPage';
import {
  API_REFERENCE_PATH,
  API_SPECS,
  DOC_PAGES,
  DOC_SECTIONS,
  docPath,
  docSource,
  findDocPage,
  sectionOf
} from './pages';
import { GITHUB_URL } from '../content';
import { CODE_LANGUAGE_KEY } from './codeLanguage';
import sitemap from '../../public/sitemap.xml?raw';
import llms from '../../public/llms.txt?raw';

vi.mock('../config/ConfigProvider', () => ({
  useConfig: () => ({ SHELL_FRONT_URL: 'http://shell.test' })
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs/*" element={<DocsApp />} />
      </Routes>
    </MemoryRouter>
  );

const article = () => within(screen.getByRole('article'));

beforeEach(() => {
  window.scrollTo = vi.fn();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('docs pages', () => {
  it.each(DOC_PAGES.map((page) => [docPath(page), page] as const))(
    '%s shows its title, section and lead',
    (path, page) => {
      renderAt(path);

      expect(article().getByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();
      expect(article().getByText(sectionOf(page)!.title)).toBeInTheDocument();
      expect(article().getByText(page.description)).toBeInTheDocument();
      expect(document.title).toBe(`${page.title} — Visin docs`);
    }
  );

  it('describes each page to search results and link previews', () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    document.head.appendChild(meta);
    try {
      for (const page of DOC_PAGES) {
        const { unmount } = renderAt(docPath(page));
        expect(meta.content).toBe(page.description);
        unmount();
      }
      renderAt('/docs/no-such-page');
      expect(meta.content).toBe('There is no Visin docs page at this address.');
    } finally {
      meta.remove();
    }
  });

  it('links each page to its own source file on GitHub, which exists', () => {
    const sources = Object.keys(import.meta.glob('./content/*.mdx')).map((file) => file.replace('./content/', ''));
    for (const page of DOC_PAGES) {
      const { unmount } = renderAt(docPath(page));
      expect(screen.getByRole('link', { name: /edit this page on github/i })).toHaveAttribute(
        'href',
        `${GITHUB_URL}/edit/main/${docSource(page)}`
      );
      expect(sources).toContain(docSource(page).split('/').pop());
      unmount();
    }
  });

  it('lists every page in the sidebar by section, marking the open one', () => {
    renderAt('/docs/quickstart');

    const sidebar = within(screen.getByRole('navigation', { name: 'Docs' }));
    for (const section of DOC_SECTIONS) {
      expect(sidebar.getByText(section.title)).toBeInTheDocument();
      for (const page of section.pages) {
        expect(sidebar.getByRole('link', { name: page.title })).toHaveAttribute('href', docPath(page));
      }
    }
    expect(sidebar.getByRole('link', { name: 'Quickstart' })).toHaveAttribute('aria-current', 'page');
    expect(sidebar.getByRole('link', { name: 'API reference' })).toHaveAttribute('href', API_REFERENCE_PATH);
    expect(sidebar.getByRole('link', { name: 'Authentication' })).not.toHaveAttribute('aria-current');
  });

  it.each(['/docs/no-such-page', '/docs/quickstart/deeper'])('says %s is not a page, with a way back', (path) => {
    renderAt(path);

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(document.title).toBe('Page not found — Visin docs');
    fireEvent.click(screen.getByRole('link', { name: /go to the docs home/i }));
    expect(article().getByRole('heading', { level: 1, name: DOC_PAGES[0].title })).toBeInTheDocument();
  });

  it('leads from each page to the next in reading order, first to last', () => {
    renderAt('/docs');

    const way = () => within(screen.getByRole('navigation', { name: 'Previous and next' }));
    expect(way().queryByText('Previous')).not.toBeInTheDocument();
    for (const page of DOC_PAGES.slice(1)) {
      fireEvent.click(way().getByRole('link', { name: new RegExp(`^next ${page.title}$`, 'i') }));
      expect(article().getByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();
    }
    expect(way().queryByText('Next')).not.toBeInTheDocument();
    const secondLast = DOC_PAGES[DOC_PAGES.length - 2];
    expect(way().getByRole('link', { name: new RegExp(`^previous ${secondLast.title}$`, 'i') })).toHaveAttribute(
      'href',
      docPath(secondLast)
    );
  });

  it('follows a link between docs pages in place', () => {
    renderAt('/docs');

    fireEvent.click(article().getAllByRole('link', { name: 'Quickstart' })[0]);
    expect(article().getByRole('heading', { level: 1, name: 'Quickstart' })).toBeInTheDocument();
  });

  it('gives each section an anchor and lists it under "On this page"', () => {
    renderAt('/docs/quickstart');

    const heading = article().getByRole('heading', { level: 2, name: /create a project token/i });
    expect(heading).toHaveAttribute('id', 'create-a-project-token');
    const outline = within(screen.getByRole('navigation', { name: 'On this page' }));
    expect(outline.getByRole('link', { name: 'Create a project token' })).toHaveAttribute(
      'href',
      '#create-a-project-token'
    );
  });
});

describe('the API reference route', () => {
  it('opens the reference at /docs/api, outside the guides layout', async () => {
    vi.doMock('@scalar/api-reference-react', () => ({ ApiReferenceReact: () => <p>Scalar reference</p> }));
    renderAt('/docs/api');

    expect(await screen.findByText('Scalar reference', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Docs' })).not.toBeInTheDocument();
    vi.doUnmock('@scalar/api-reference-react');
  });
});

describe('DocsPage outside the docs routes', () => {
  it('shows the docs home when its route names no page', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Routes>
          <Route path="/elsewhere" element={<DocsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1, name: DOC_PAGES[0].title })).toBeInTheDocument();
  });
});

describe('docs scrolling', () => {
  it('opens a page at its top', () => {
    renderAt('/docs/authentication');

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('opens a page at the section its link names', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderAt('/docs/authentication#user-api-keys');

    expect(scrollIntoView).toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('falls back to the top when the named section does not exist', () => {
    renderAt('/docs/authentication#gone');

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('the quickstart', () => {
  it('shows the run being created before its epochs, in Python and in curl', () => {
    renderAt('/docs/quickstart');

    const tabs = screen.getByRole('tablist', { name: 'Code language' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(['Python', 'curl']);

    const python = screen.getByRole('tabpanel').textContent!;
    expect(python.indexOf('/api/trainings')).toBeLessThan(python.indexOf('/api/epochs/upload'));
    expect(python).toContain('os.environ["VISIN_URL"]');

    fireEvent.click(within(tabs).getByRole('tab', { name: 'curl' }));
    const curl = screen.getByRole('tabpanel').textContent!;
    expect(curl).toContain('curl -fsS "$VISIN_URL/api/trainings"');
    expect(window.localStorage.getItem(CODE_LANGUAGE_KEY)).toBe('bash');
  });

  it('opens on the language the reader picked last time', () => {
    window.localStorage.setItem(CODE_LANGUAGE_KEY, 'bash');
    renderAt('/docs/quickstart');

    expect(screen.getByRole('tab', { name: 'curl' })).toHaveAttribute('aria-selected', 'true');
  });

  it('never shows a real deployment address', () => {
    // Visin is self-hosted: an example must not send anyone to someone else's server.
    for (const page of DOC_PAGES) {
      const { unmount } = renderAt(docPath(page));
      const text = screen.getByRole('article').textContent!;
      for (const url of text.match(/https?:\/\/[^\s"'`)]+/g) ?? []) {
        expect(url).toMatch(/^https?:\/\/(localhost|[\w.-]*example\.(com|test)|github\.com\/visin-platform)/);
      }
      unmount();
    }
  });
});

describe('the docs registry', () => {
  it('names each page once, with the home at /docs', () => {
    expect(new Set(DOC_PAGES.map((page) => page.slug)).size).toBe(DOC_PAGES.length);
    expect(docPath(DOC_PAGES[0])).toBe('/docs');
    expect(findDocPage('quickstart')?.title).toBe('Quickstart');
    expect(findDocPage('nope')).toBeUndefined();
  });

  it('lists every page and published spec in llms.txt, as the pages describe themselves', () => {
    for (const page of DOC_PAGES) {
      expect(llms).toContain(`- [${page.title}](__LANDING_FRONT_URL__${docPath(page)}): ${page.description}`);
    }
    for (const spec of API_SPECS) {
      expect(llms).toContain(`- [${spec.title}](__LANDING_FRONT_URL__${spec.url}): `);
    }
  });

  it('lists every page in the sitemap', () => {
    for (const path of [...DOC_PAGES.map(docPath), API_REFERENCE_PATH]) {
      expect(sitemap).toContain(`<loc>__LANDING_FRONT_URL__${path}</loc>`);
    }
  });
});
