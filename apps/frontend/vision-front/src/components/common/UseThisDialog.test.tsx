import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UseThisDialog from './UseThisDialog';

describe('UseThisDialog', () => {
  it('shows each snippet with its title, note and a copy button, and closes', () => {
    const onClose = vi.fn();
    render(
      <UseThisDialog
        title="Use this run"
        snippets={[{ title: 'Set up once', note: 'A key is yours.', code: 'export A=1' }, { title: 'Load it', code: 'api.training("u")' }]}
        onClose={onClose}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Use this run' })).toBeInTheDocument();
    expect(screen.getByText('A key is yours.')).toBeInTheDocument();
    expect(screen.getByText('export A=1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Load it' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
