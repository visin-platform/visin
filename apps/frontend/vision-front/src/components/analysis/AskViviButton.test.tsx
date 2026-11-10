import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));

import AskViviButton from './AskViviButton';

afterEach(() => {
  auth.isAuthenticated = false;
  auth.isLoading = false;
  delete window.__visinGuestVivi;
});

const show = (visibility = 'public') =>
  render(<AskViviButton projectId="p1" title="Road scenes" visibility={visibility} />);

describe('AskViviButton', () => {
  it('asks the shell to open Vivi on this project, for a visitor, when guest Vivi is on', () => {
    window.__visinGuestVivi = true;
    const opened = vi.fn();
    window.addEventListener('visin:open-chat', opened);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Ask Vivi about this project' }));
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ kind: 'project', projectId: 'p1', title: 'Road scenes' });
    window.removeEventListener('visin:open-chat', opened);
  });

  it('appears when the shell announces it later, and goes when guest Vivi is switched off', () => {
    show();
    expect(screen.queryByRole('button')).toBeNull();
    act(() => void window.dispatchEvent(new CustomEvent('visin:guest-vivi', { detail: true })));
    expect(screen.getByRole('button', { name: 'Ask Vivi about this project' })).toBeInTheDocument();
    act(() => void window.dispatchEvent(new CustomEvent('visin:guest-vivi', { detail: false })));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is not offered for a private project, to someone signed in, or while the session is being checked', () => {
    window.__visinGuestVivi = true;
    show('private').unmount();
    expect(screen.queryByRole('button')).toBeNull();
    auth.isAuthenticated = true;
    show().unmount();
    expect(screen.queryByRole('button')).toBeNull();
    auth.isAuthenticated = false;
    auth.isLoading = true;
    show();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
