import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RemoveGroupDialog from './RemoveGroupDialog';

const groups = [
  { name: 'frames', images: 1, jsons: 0 },
  { name: 'verify', images: 2, jsons: 3 }
];

describe('RemoveGroupDialog', () => {
  it('removes the chosen group, describing what goes with it', () => {
    const onConfirm = vi.fn();
    render(<RemoveGroupDialog open groups={groups} busy={false} onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByLabelText('frames — 1 image')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('verify — 2 images, 3 JSON'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 2 images, 3 JSON' }));
    expect(onConfirm).toHaveBeenCalledWith('verify');
  });

  it('shows a refusal and can be cancelled', () => {
    const onCancel = vi.fn();
    render(<RemoveGroupDialog open groups={groups} busy={false} error="In use by a labeling job" onCancel={onCancel} onConfirm={vi.fn()} />);
    expect(screen.getByText('In use by a labeling job')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
