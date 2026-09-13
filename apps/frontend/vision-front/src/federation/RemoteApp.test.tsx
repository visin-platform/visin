import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../routes', () => ({ default: () => <div>vision routes</div> }));
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../config/ConfigProvider', () => ({
  ConfigProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import RemoteApp from './RemoteApp';

describe('RemoteApp', () => {
  // shell-front owns the router and the menu; the exposed module brings neither,
  // so rendering it inside the host's router must not draw a second sidebar.
  it('renders the routes inside the host router with no layout of its own', () => {
    render(
      <MemoryRouter>
        <RemoteApp />
      </MemoryRouter>
    );

    expect(screen.getByText('vision routes')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
