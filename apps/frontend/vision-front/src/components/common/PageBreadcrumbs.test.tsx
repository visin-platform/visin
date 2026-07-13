import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const items: BreadcrumbItem[] = [{ label: 'Current Page', href: '/current', current: true }];
    render(
      <MemoryRouter>
        <PageBreadcrumbs items={items} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: 'Current Page' })).not.toBeInTheDocument();
    expect(screen.getByText('Current Page')).toBeInTheDocument();
  });

  it('renders plain text for an item with no href', () => {
    const items: BreadcrumbItem[] = [{ label: 'No Link Item' }];
    render(
      <MemoryRouter>
        <PageBreadcrumbs items={items} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No Link Item')).toBeInTheDocument();
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
});
