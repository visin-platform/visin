import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PageSkeleton } from './PageSkeleton';

it('stands in for a page while it loads, and says so to a screen reader like the spinner it replaces', () => {
  const { container } = render(<PageSkeleton label="Loading run" />);
  const bar = screen.getByRole('progressbar', { name: 'Loading run' });
  expect(bar).toHaveAttribute('aria-busy', 'true');
  // Shapes where the page's parts will be: a title, tabs, figures and charts.
  expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThanOrEqual(12);
});

it('is just "Loading" unless it is told more', () => {
  render(<PageSkeleton />);
  expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
});
