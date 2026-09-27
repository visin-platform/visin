import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OwnerChip, OwnerPicker, TransferOwnershipDialog, VisibilitySwitch, ownerLabel, transferTargets, type OwnerGroup } from '.';

const ME = 'me';
const groups: OwnerGroup[] = [
  { id: 'lab', name: 'Vision lab', role: 'owner' },
  { id: 'team', name: 'Road team', role: 'member' }
];

describe('transferTargets', () => {
  it('offers my groups for what is mine', () => {
    expect(transferTargets({ kind: 'user', id: ME }, ME, groups)).toEqual([
      { kind: 'group', id: 'lab' },
      { kind: 'group', id: 'team' }
    ]);
  });

  it("offers me and my other groups for a group's, when I own the group", () => {
    expect(transferTargets({ kind: 'group', id: 'lab' }, ME, groups)).toEqual([
      { kind: 'user', id: ME },
      { kind: 'group', id: 'team' }
    ]);
  });

  it('offers nothing otherwise', () => {
    expect(transferTargets({ kind: 'group', id: 'team' }, ME, groups)).toEqual([]);
    expect(transferTargets({ kind: 'user', id: 'someone' }, ME, groups)).toEqual([]);
  });
});

describe('ownerLabel', () => {
  it('names me, my groups, and what I cannot name', () => {
    expect(ownerLabel({ kind: 'user', id: ME }, ME, groups)).toBe('Me');
    expect(ownerLabel({ kind: 'user', id: 'someone' }, ME, groups)).toBe('Another person');
    expect(ownerLabel({ kind: 'group', id: 'team' }, ME, groups)).toBe('Road team');
    expect(ownerLabel({ kind: 'group', id: 'elsewhere' }, ME, groups)).toBe('A group');
  });
});

describe('OwnerPicker', () => {
  it('offers me and my groups, and says what each choice means', () => {
    const onChange = vi.fn();
    const { rerender } = render(<OwnerPicker value={{ kind: 'user', id: ME }} onChange={onChange} userId={ME} groups={groups} />);
    expect(screen.getByText(/Only you can see and change it/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText('Owner'));
    fireEvent.click(screen.getByRole('option', { name: 'Road team' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'group', id: 'team' });

    rerender(<OwnerPicker value={{ kind: 'group', id: 'team' }} onChange={onChange} userId={ME} groups={groups} />);
    expect(screen.getByText(/The group's roles decide/)).toBeInTheDocument();
  });
});

describe('VisibilitySwitch', () => {
  it('switches between private and public, explaining each', () => {
    const onChange = vi.fn();
    const { rerender } = render(<VisibilitySwitch value="private" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Public'));
    expect(onChange).toHaveBeenCalledWith('public');

    rerender(<VisibilitySwitch value="public" onChange={onChange} />);
    expect(screen.getByText(/even without signing in/)).toBeInTheDocument();
  });

  it('keeps public out of reach, with the reason, for someone who may not publish', () => {
    render(<VisibilitySwitch value="private" onChange={vi.fn()} canMakePublic={false} />);
    expect(screen.getByLabelText('Public')).toBeDisabled();
    expect(screen.getByText(/Only the owner can make it public/)).toBeInTheDocument();
  });
});

describe('OwnerChip', () => {
  it('shows who owns it', () => {
    const { rerender } = render(<OwnerChip owner={{ kind: 'user', id: ME }} userId={ME} groups={groups} ownerName="Ignored for me" />);
    expect(screen.getByLabelText('Owner: Me')).toBeInTheDocument();
    rerender(<OwnerChip owner={{ kind: 'group', id: 'elsewhere' }} userId={ME} groups={groups} ownerName="Night team" />);
    expect(screen.getByLabelText('Owner: Night team')).toBeInTheDocument();
    rerender(<OwnerChip owner={{ kind: 'group', id: 'lab' }} userId={ME} groups={groups} />);
    expect(screen.getByLabelText('Owner: Vision lab')).toBeInTheDocument();
  });
});

describe('TransferOwnershipDialog', () => {
  const renderDialog = (current = { kind: 'user' as const, id: ME }, props: Partial<Parameters<typeof TransferOwnershipDialog>[0]> = {}) => {
    const onTransfer = vi.fn();
    const onClose = vi.fn();
    render(
      <TransferOwnershipDialog
        open
        resourceName="Road scenes"
        current={current}
        userId={ME}
        groups={groups}
        onClose={onClose}
        onTransfer={onTransfer}
        {...props}
      />
    );
    return { onTransfer, onClose, dialog: within(screen.getByRole('dialog', { name: 'Transfer Road scenes' })) };
  };

  it('transfers to a chosen group, warning that it is one-way', () => {
    const { onTransfer, dialog } = renderDialog();
    expect(dialog.getByText(/only that group’s owner can move it again/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Transfer' })).toBeDisabled();

    fireEvent.mouseDown(dialog.getByLabelText('New owner'));
    fireEvent.click(screen.getByRole('option', { name: 'Vision lab' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Transfer' }));
    expect(onTransfer).toHaveBeenCalledWith({ kind: 'group', id: 'lab' });
  });

  it('says why when there is nowhere it may go', () => {
    const { onClose, dialog } = renderDialog({ kind: 'group', id: 'team' } as never);
    expect(dialog.getByText("Only the owning group's owner can transfer it.")).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Transfer' })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says so for someone else's, and shows a refusal from the server", () => {
    const { dialog } = renderDialog({ kind: 'user', id: 'someone' } as never, { error: 'You can only transfer it to a group you are in' });
    expect(dialog.getByText('Only its owner can transfer it.')).toBeInTheDocument();
    expect(dialog.getByText('You can only transfer it to a group you are in')).toBeInTheDocument();
  });
});
