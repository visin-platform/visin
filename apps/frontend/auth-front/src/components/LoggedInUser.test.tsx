import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoggedInUser from './LoggedInUser';

describe('LoggedInUser', () => {
  const user = { name: 'Ada Lovelace', email: 'ada@example.com', picture: 'http://pic.test' };

  it('renders the user info', () => {
    render(<LoggedInUser user={user} onContinue={vi.fn()} onLogout={vi.fn()} />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByAltText('Ada Lovelace')).toHaveAttribute('src', 'http://pic.test');
  });

  it('calls onContinue and onLogout', () => {
    const onContinue = vi.fn();
    const onLogout = vi.fn();
    render(<LoggedInUser user={user} onContinue={onContinue} onLogout={onLogout} />);

    fireEvent.click(screen.getByRole('button', { name: /continue to app/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
