import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPrompt from './LoginPrompt';

describe('LoginPrompt', () => {
  it('shows a spinner while loading', () => {
    render(<LoginPrompt isLoading initializationAttempted={false} />);

    expect(screen.getByText('Initializing secure connection...')).toBeInTheDocument();
  });

  it('shows "Preparing authentication..." before initialization is attempted', () => {
    render(<LoginPrompt isLoading={false} initializationAttempted={false} />);

    expect(screen.getByText('Preparing authentication...')).toBeInTheDocument();
    expect(screen.getByText('SECURE LOGIN')).toBeInTheDocument();
  });

  it('shows the Google Sign-In loading state once initialization is attempted', () => {
    render(<LoginPrompt isLoading={false} initializationAttempted />);

    expect(screen.getByText('Loading Google Sign-In...')).toBeInTheDocument();
  });

  it('renders an error message when provided', () => {
    render(<LoginPrompt isLoading={false} initializationAttempted error="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders no error text when error is absent', () => {
    render(<LoginPrompt isLoading={false} initializationAttempted={false} />);

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
