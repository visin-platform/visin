import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));
vi.mock('./routes', () => ({ default: () => <div>app-routes</div> }));

describe('App', () => {
  it('renders the layout wrapping the routes', () => {
    render(<App />);

    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.getByText('app-routes')).toBeInTheDocument();
  });
});
