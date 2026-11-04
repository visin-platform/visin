import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OpenChatButton } from './OpenChatButton';
it('only offers chat in the shell and emits a typed group or member request', () => {
  const { rerender } = render(<OpenChatButton request={{ kind: 'group', groupId: 'g1' }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  const root = document.createElement('div');
  root.id = 'shell-root';
  document.body.append(root);
  const receive = vi.fn();
  window.addEventListener('visin:open-chat', receive);
  try {
    rerender(<OpenChatButton request={{ kind: 'group', groupId: 'g1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(receive.mock.calls[0][0].detail).toEqual({ kind: 'group', groupId: 'g1' });
    rerender(<OpenChatButton label="Message" request={{ kind: 'direct', userId: 'bob', name: 'Bob' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Message' }));
    expect(receive.mock.calls[1][0].detail).toEqual({ kind: 'direct', userId: 'bob', name: 'Bob' });
  } finally {
    root.remove();
    window.removeEventListener('visin:open-chat', receive);
  }
});
