import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RunNotes from './RunNotes';

describe('RunNotes', () => {
  it('shows the note to a reader, who cannot edit it, and nothing when there is none', () => {
    const { container, rerender } = render(<RunNotes notes={'used the relabelled night set\nseed 2'} canEdit={false} onSave={vi.fn()} />);
    expect(screen.getByText(/used the relabelled night set/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<RunNotes canEdit={false} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('invites a writer to add the first note', () => {
    render(<RunNotes canEdit onSave={vi.fn()} />);
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a note' })).toBeInTheDocument();
  });

  it('saves an edited note and goes back to showing it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RunNotes notes="old" canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Note')).toHaveValue('old');
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'new note' } });
    expect(screen.getByText('8 / 5,000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('new note'));
    await waitFor(() => expect(screen.queryByLabelText('Note')).not.toBeInTheDocument());
  });

  it('keeps the draft and says why when saving is refused', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Write permission is required for this resource'));
    render(<RunNotes notes="old" canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'mine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Write permission is required for this resource')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toHaveValue('mine');
  });

  it('cancels without saving, and refuses a note past the limit', () => {
    const onSave = vi.fn();
    render(<RunNotes notes="old" canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'x'.repeat(5001) } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('old')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Note')).toHaveValue('old');
  });
});
