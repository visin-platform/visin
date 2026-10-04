import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShareButton } from './ShareButton';

describe('ShareButton', () => {
  it('offers nothing when this deployment has no service URL', () => {
    render(<ShareButton />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('copies the preview link and confirms success until focus leaves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ShareButton url="https://api.example.test/share/project" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('https://api.example.test/share/project');
    fireEvent.blur(screen.getByRole('button', { name: 'Link copied' }));
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('offers a selectable link if clipboard access fails, and lets the reader close it', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });
    render(<ShareButton url="https://api.example.test/share/project" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const input = await screen.findByRole('textbox', { name: 'Share link' });
    expect(input).toHaveValue('https://api.example.test/share/project');
    const select = vi.spyOn(input as HTMLInputElement, 'select');
    fireEvent.focus(input);
    expect(select).toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('does not report a new page as copied after the URL changes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const view = render(<ShareButton url="https://api.example.test/share/first" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('button', { name: 'Link copied' });
    view.rerender(<ShareButton url="https://api.example.test/share/second" />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('closes a manual-copy dialog belonging to the previous page', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });
    const view = render(<ShareButton url="https://api.example.test/share/first" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('dialog');
    view.rerender(<ShareButton url="https://api.example.test/share/second" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
