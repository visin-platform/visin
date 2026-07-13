import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SecurityTab from './SecurityTab';

describe('SecurityTab', () => {
  it('renders the security items and recommendation', () => {
    render(<SecurityTab />);

    expect(screen.getByText('Security Settings')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.getByText('Login History')).toBeInTheDocument();
    expect(screen.getByText('Security Recommendation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
  });
});
