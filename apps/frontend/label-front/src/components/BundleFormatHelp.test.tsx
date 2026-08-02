import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import BundleFormatHelp from './BundleFormatHelp';
import { renderWithProviders } from '../test/renderWithProviders';

describe('BundleFormatHelp', () => {
  it('starts collapsed and expands to show the zip layout and rules', () => {
    renderWithProviders(<BundleFormatHelp />);

    const summary = screen.getByRole('button', { name: /How to upload a bundle/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(summary);

    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/annotations\/\s+optional — one folder per annotation set/)).toBeInTheDocument();
    expect(screen.getByText(/Map the folders/)).toBeInTheDocument();
    expect(screen.getByText(/Other layouts are mapped, not rejected/)).toBeInTheDocument();
    expect(screen.getByText(/The filename stem is the link key/)).toBeInTheDocument();
    expect(screen.getByText(/Re-uploading is additive/)).toBeInTheDocument();
  });

  it('links to the new job page', () => {
    renderWithProviders(<BundleFormatHelp />);
    fireEvent.click(screen.getByRole('button', { name: /How to upload a bundle/ }));

    expect(screen.getByRole('link', { name: 'new job' })).toHaveAttribute('href', '/jobs/new');
  });
});
