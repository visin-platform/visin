import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HubSourceDialog from './HubSourceDialog';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';

const renderDialog = (props: Partial<React.ComponentProps<typeof HubSourceDialog>> = {}) => {
  const onSave = vi.fn();
  render(<HubSourceDialog open hasZip={false} busy={false} onCancel={vi.fn()} onSave={onSave} {...props} />);
  return onSave;
};
const fill = (repo: string, revision: string) => {
  fireEvent.change(screen.getByLabelText('Dataset repo'), { target: { value: repo } });
  fireEvent.change(screen.getByLabelText('Commit'), { target: { value: revision } });
};

describe('HubSourceDialog', () => {
  it('saves a repo and a commit, trimmed and lower-cased', () => {
    const onSave = renderDialog();
    fill(' acme/zod-png ', ` ${COMMIT.toUpperCase()} `);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ provider: 'hf', repo: 'acme/zod-png', revision: COMMIT });
  });

  it('refuses a branch name and a bare repo name, saying why', () => {
    const onSave = renderDialog();
    fill('zod-png', 'main');
    expect(screen.getByText('Expected a repo id like "org/name"')).toBeInTheDocument();
    expect(screen.getByText(/full 40-character commit hash/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('marks empty fields only once a save was tried', () => {
    const onSave = renderDialog();
    expect(screen.getByLabelText('Dataset repo')).not.toBeInvalid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Dataset repo')).toBeInvalid();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts from the current source and clears it, naming the zip fallback when there is one', () => {
    const onSave = renderDialog({ current: { provider: 'hf', repo: 'acme/zod-png', revision: COMMIT }, hasZip: true });
    expect(screen.getByLabelText('Dataset repo')).toHaveValue('acme/zod-png');
    expect(screen.getByText(/stays as a fallback/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use the zip instead' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('shows a refusal from the server', () => {
    renderDialog({ error: 'Not allowed' });
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
  });

  it('shows the visin push command for a dataset with a zip and no source, with the licence warning', () => {
    renderDialog({ hasZip: true, datasetId: 'd1' });
    expect(screen.getByText(/visin push d1 --repo org\/name/)).toBeInTheDocument();
    expect(screen.getByText(/licence allows redistribution/)).toBeInTheDocument();
  });

  it('leaves the command out when there is no zip to publish or the dataset is already on the Hub', () => {
    const { unmount } = render(<HubSourceDialog open hasZip={false} datasetId="d1" busy={false} onCancel={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText(/visin push/)).not.toBeInTheDocument();
    unmount();
    renderDialog({ hasZip: true, datasetId: 'd1', current: { provider: 'hf', repo: 'acme/zod-png', revision: COMMIT } });
    expect(screen.queryByText(/visin push/)).not.toBeInTheDocument();
  });
});
