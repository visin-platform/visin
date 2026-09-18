import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listMyGroups = vi.hoisted(() => vi.fn());
vi.mock('../../services/datasetService', () => ({ listMyGroups }));

import DatasetFormDialog from './DatasetFormDialog';
import { renderWithClient } from '../../test/renderWithClient';

const zipFile = (name = 'waymo.zip', size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/zip' });

describe('DatasetFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyGroups.mockResolvedValue([{ id: 'g1', name: 'Team', role: 'admin' }]);
  });

  it('creates: needs a zip, names itself after it, and shares with a chosen group', async () => {
    const onSubmit = vi.fn();
    renderWithClient(<DatasetFormDialog open mode="create" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(screen.getByText('Choose a .zip file')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [zipFile('notes.txt')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(screen.getByText('Datasets are uploaded as .zip archives')).toBeInTheDocument();

    const file = zipFile();
    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [file] } });
    expect(screen.getByLabelText(/Name/)).toHaveValue('notes.txt');
    await userEvent.clear(screen.getByLabelText(/Name/));
    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [file] } });
    expect(screen.getByLabelText(/Name/)).toHaveValue('waymo');
    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [] } });

    await userEvent.type(screen.getByLabelText('Description'), 'Front camera');
    fireEvent.click(screen.getByLabelText('A group'));
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(screen.getByText('Choose the group to share with')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText('Group'));
    fireEvent.click(await screen.findByRole('option', { name: 'Team' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'waymo', description: 'Front camera', visibility: 'group', groupId: 'g1', file });
  });

  it('edits details without a file, and requires a name', async () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <DatasetFormDialog open mode="edit" initial={{ name: 'ZOD', visibility: 'public' }} busy={false} error="Server said no" onCancel={vi.fn()} onSubmit={onSubmit} />
    );
    expect(screen.getByText('Server said no')).toBeInTheDocument();
    expect(screen.queryByTestId('dataset-zip-input')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Name/));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('A name is required')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Name/), 'ZOD v2');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'ZOD v2', description: '', visibility: 'public', groupId: undefined, file: undefined });
  });

  it('asks only for the zip when replacing one', async () => {
    const onCancel = vi.fn();
    renderWithClient(<DatasetFormDialog open mode="replace" busy={false} onCancel={onCancel} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [zipFile()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(listMyGroups).not.toHaveBeenCalled();
    expect(screen.getByText(/uploads in the corner of the page/)).toBeInTheDocument();
  });
});
