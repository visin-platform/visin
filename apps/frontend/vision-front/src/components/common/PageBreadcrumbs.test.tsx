import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PageBreadcrumbs, { BreadcrumbItem } from './PageBreadcrumbs';

describe('PageBreadcrumbs', () => {
  it('renders a link for items with an href and not marked current', () => {
    const items: BreadcrumbItem[] = [
      { label: 'Projects', href: '/projects' },
      { label: 'My Project', current: true }
    ];
    render(
      <MemoryRouter>
        <PageBreadcrumbs items={items} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Projects' });
    expect(link).toHaveAttribute('href', '/projects');
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  it('renders plain text (no link) for the current item even if href is provided', () => {
    const items: BreadcrumbItem[] = [{ label: 'Projects', href: '/projects' }, { label: 'Current Page', href: '/current', current: true }];
    render(
      <MemoryRouter>
        <PageBreadcrumbs items={items} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: 'Current Page' })).not.toBeInTheDocument();
    expect(screen.getByText('Current Page')).toBeInTheDocument();
  });

  it('renders plain text for an item with no href', () => {
    const items: BreadcrumbItem[] = [{ label: 'Parent' }, { label: 'No Link Item' }];
    render(
      <MemoryRouter>
        <PageBreadcrumbs items={items} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No Link Item')).toBeInTheDocument();
  });

  it('renders nothing for a trail of one, which the app bar already names', () => {
    const { container } = render(
      <MemoryRouter>
        <PageBreadcrumbs items={[{ label: 'Trainings', current: true }]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders multiple items in order', () => {
    const items: BreadcrumbItem[] = [
      { label: 'Home', href: '/' },
      { label: 'Section', href: '/section' },
      { label: 'Detail', current: true }
    ];
    render(
      <MemoryRouter>
        <PageBreadcrumbs items={items} />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('Detail')).toBeInTheDocument();
  });

  describe('on a phone', () => {
    const items: BreadcrumbItem[] = [
      { label: 'Projects', href: '/projects' },
      { label: 'My Project', current: true }
    ];
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
    const barGoesTo = (path: string | undefined) =>
      act(() => {
        window.__visinBarBack = path === undefined ? undefined : { path, label: 'Elsewhere' };
        window.dispatchEvent(new Event('visin:bar-back'));
      });
    afterEach(() => {
      vi.unstubAllGlobals();
      delete window.__visinBarBack;
    });

    it('offers one step back as a single link', () => {
      asPhone();
      render(
        <MemoryRouter>
          <PageBreadcrumbs items={items} />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
      expect(screen.queryByText('My Project')).not.toBeInTheDocument();
    });

    it('leaves it out while the app bar goes back to the same place, and brings it back when the bar changes', () => {
      asPhone();
      window.__visinBarBack = { path: '/projects', label: 'Projects' };
      render(
        <MemoryRouter>
          <PageBreadcrumbs items={items} />
        </MemoryRouter>
      );
      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();

      barGoesTo('/trainings');
      expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    });

    it('also leaves it out when the bar says the same thing for another place', () => {
      asPhone();
      window.__visinBarBack = { path: '/trainings', label: 'Projects' };
      render(
        <MemoryRouter>
          <PageBreadcrumbs items={[{ label: 'Projects', href: '/projects/p1?tab=trainings' }, { label: 'Run', current: true }]} />
        </MemoryRouter>
      );

      expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    });
  });
});
