import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorPage } from '../../components/ErrorPage/ErrorPage';

describe('ErrorPage', () => {
  it('renders the default title', () => {
    render(<ErrorPage />);
    expect(screen.getByText('Configuration Error')).toBeInTheDocument();
  });

  it('renders a custom title', () => {
    render(<ErrorPage title="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders a custom text message', () => {
    render(<ErrorPage message="Network unavailable" />);
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
  });

  it('shows the retry button by default', () => {
    render(<ErrorPage />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('hides the retry button when showRetry is false', () => {
    render(<ErrorPage showRetry={false} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorPage onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
