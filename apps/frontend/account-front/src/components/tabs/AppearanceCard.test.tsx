import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VisinThemeProvider } from '@visin/frontend-core';
import AppearanceCard from './AppearanceCard';

describe('AppearanceCard', () => {
  it('switches the page between light and dark', async () => {
    render(
      <VisinThemeProvider>
        <AppearanceCard />
      </VisinThemeProvider>
    );

    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'light'));
  });
});
