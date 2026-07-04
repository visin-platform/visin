import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loader } from './Loader';

describe('Loader', () => {
  it('renders the default loading message', () => {
    render(<Loader />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders a custom message', () => {
    render(<Loader message="Fetching data..." />);
    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
  });

  it('does not show the default message when a custom one is provided', () => {
    render(<Loader message="Please wait" />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
