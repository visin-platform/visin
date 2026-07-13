import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './index';

vi.mock('../pages/LoginPage', () => ({ default: () => <div>login-page</div> }));

describe('AppRoutes', () => {
  it('renders LoginPage at the root path', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getByText('login-page')).toBeInTheDocument();
  });
});
