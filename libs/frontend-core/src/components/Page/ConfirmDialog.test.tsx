import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmDialog, ListSkeleton } from '.';

const props = { open: true, title: 'Delete this comparison?', confirmLabel: 'Delete', onConfirm: vi.fn(), onCancel: vi.fn() };

describe('ConfirmDialog', () => {
  it('asks the question, says what happens, and does it only on the named button', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm}>It disappears for everyone.</ConfirmDialog>);

    expect(screen.getByRole('dialog', { name: 'Delete this comparison?' })).toHaveTextContent('It disappears for everyone.');
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('backs out on Cancel and is not drawn while closed', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog {...props} onCancel={onCancel}>x</ConfirmDialog>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();

    rerender(<ConfirmDialog {...props} open={false}>x</ConfirmDialog>);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('focuses Cancel for a destructive act and the button for an ordinary one', () => {
    const destructive = render(<ConfirmDialog {...props}>x</ConfirmDialog>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    destructive.unmount();

    render(<ConfirmDialog {...props} destructive={false} confirmLabel="Publish">x</ConfirmDialog>);
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveFocus();
  });

  it('holds still while it runs, and says so on the button', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} busy onCancel={onCancel}>x</ConfirmDialog>);

    expect(screen.getByRole('button', { name: 'Delete…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('uses a given busy label, and shows why an attempt was refused', () => {
    render(<ConfirmDialog {...props} busy busyLabel="Deleting job…" error="A labeler has it open">x</ConfirmDialog>);

    expect(screen.getByRole('button', { name: 'Deleting job…' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('A labeler has it open');
  });
});

describe('ListSkeleton', () => {
  it('stands in for the rows, named for assistive technology', () => {
    render(<ListSkeleton rows={3} label="Loading runs" />);

    const region = screen.getByRole('status', { name: 'Loading runs' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.children).toHaveLength(3);
  });

  it('is five rows called Loading unless told otherwise', () => {
    render(<ListSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading' }).children).toHaveLength(5);
  });
});
