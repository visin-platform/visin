import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="auth">{children}</div>,
}));
vi.mock('./components/ShellLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));
vi.mock('./routes', () => ({ default: () => <div>routes</div> }));

import App from './App';

describe('App', () => {
  it('mounts the routes inside one layout and one session', () => {
    render(<App />);

    expect(screen.getByTestId('auth')).toContainElement(screen.getByTestId('layout'));
    expect(screen.getByTestId('layout')).toContainElement(screen.getByText('routes'));
  });
});
