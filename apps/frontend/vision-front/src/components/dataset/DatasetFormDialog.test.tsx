import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listMyGroups = vi.hoisted(() => vi.fn());
const listLicenses = vi.hoisted(() => vi.fn());
vi.mock('../../services/datasetService', () => ({ listMyGroups, listLicenses }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import DatasetFormDialog from './DatasetFormDialog';
import { renderWithClient } from '../../test/renderWithClient';

const zipFile = (name = 'waymo.zip', size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/zip' });

describe('DatasetFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLicenses.mockResolvedValue([
  { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', commercial: true },
  { id: 'cc-by-nc-4.0', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/', commercial: false },
  { id: 'mit', name: 'MIT', url: 'https://opensource.org/license/mit', commercial: true },
  { id: 'other', name: 'Other' }
]);
    listMyGroups.mockResolvedValue([
      { id: 'g1', name: 'Team', role: 'admin' },
      { id: 'g2', name: 'Lab', role: 'owner' }
    ]);
  });

  it('creates: needs a zip, names itself after it, and belongs to me unless I choose a group', async () => {
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
    fireEvent.click(screen.getByLabelText('Public'));
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      name: 'waymo',
      description: 'Front camera',
      visibility: 'public',
      owner: { kind: 'user', id: 'u1' },
      file
    });
  });

  it('makes a group dataset public only where I own the group', async () => {
    const onSubmit = vi.fn();
    renderWithClient(<DatasetFormDialog open mode="create" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [zipFile()] } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Owner/ })).not.toHaveAttribute('aria-disabled'));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Owner/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Team' }));
    expect(screen.getByLabelText('Public')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'private', owner: { kind: 'group', id: 'g1' } }));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Owner/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Lab' }));
    fireEvent.click(screen.getByLabelText('Public'));
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'public', owner: { kind: 'group', id: 'g2' } }));
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
    // Editing always says what the licence is, so clearing the choice takes a declaration back.
    expect(onSubmit).toHaveBeenCalledWith({ name: 'ZOD v2', description: '', visibility: 'public', license: null, credit: '', file: undefined });
    expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument();
  });

  it('keeps the sharing as it was for someone who may edit but not share', async () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <DatasetFormDialog
        open
        mode="edit"
        initial={{ name: 'ZOD', visibility: 'public' }}
        canShare={false}
        busy={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByLabelText('Private')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'ZOD', description: '', visibility: 'public', license: null, credit: '', file: undefined });
  });

  it('asks only for the zip when replacing one', async () => {
    const onCancel = vi.fn();
    renderWithClient(<DatasetFormDialog open mode="replace" busy={false} onCancel={onCancel} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [zipFile()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(listMyGroups).not.toHaveBeenCalled();
    expect(listLicenses).not.toHaveBeenCalled();
    expect(screen.getByText(/uploads in the corner of the page/)).toBeInTheDocument();
  });

  describe('the licence', () => {
    const chooseLicense = async (name: string) => {
      // The picker is disabled until the list of licences has arrived.
      await waitFor(() => expect(screen.getByRole('combobox', { name: /^Licence/ })).not.toHaveAttribute('aria-disabled'));
      fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Licence/ }));
      fireEvent.click(await screen.findByRole('option', { name }));
    };

    it('says nothing for a new dataset unless a licence is chosen, and then sends it with the credit', async () => {
      const onSubmit = vi.fn();
      renderWithClient(<DatasetFormDialog open mode="create" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} />);
      const file = zipFile();
      fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [file] } });
      fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
      expect(onSubmit.mock.lastCall![0]).not.toHaveProperty('license');
      expect(onSubmit.mock.lastCall![0]).not.toHaveProperty('credit');

      await chooseLicense('CC BY-NC 4.0');
      await userEvent.type(screen.getByLabelText('Credit'), '  Krizhevsky, 2009 ');
      fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ license: { id: 'cc-by-nc-4.0' }, credit: 'Krizhevsky, 2009' })
      );
    });

    it('asks for a name and a web link when the licence is not listed', async () => {
      const onSubmit = vi.fn();
      renderWithClient(<DatasetFormDialog open mode="create" busy={false} onCancel={vi.fn()} onSubmit={onSubmit} />);
      fireEvent.change(screen.getByTestId('dataset-zip-input'), { target: { files: [zipFile()] } });
      await chooseLicense('Other');
      fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
      expect(screen.getByText('Name the licence, or choose one from the list')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      await userEvent.type(screen.getByLabelText(/Licence name/), 'Acme research terms');
      await userEvent.type(screen.getByLabelText('Link to the licence'), 'javascript:alert(1)');
      fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
      expect(screen.getByText('The licence link must start with http:// or https://')).toBeInTheDocument();

      await userEvent.clear(screen.getByLabelText('Link to the licence'));
      await userEvent.type(screen.getByLabelText('Link to the licence'), 'https://acme.test/terms');
      fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ license: { id: 'other', name: 'Acme research terms', url: 'https://acme.test/terms' } })
      );
    });

    it('starts an edit from what is declared, and takes the declaration back when set to not stated', async () => {
      const onSubmit = vi.fn();
      renderWithClient(
        <DatasetFormDialog
          open
          mode="edit"
          initial={{ name: 'ZOD', visibility: 'public', license: { id: 'mit', name: 'MIT' }, credit: 'Ann' }}
          busy={false}
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      );
      await waitFor(() => expect(screen.getByRole('combobox', { name: /^Licence/ })).toHaveTextContent('MIT'));
      expect(screen.getByLabelText('Credit')).toHaveValue('Ann');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ license: { id: 'mit' }, credit: 'Ann' }));

      await chooseLicense('Not stated');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ license: null }));
    });

    it('keeps a licence of the other kind as it was written', async () => {
      const onSubmit = vi.fn();
      renderWithClient(
        <DatasetFormDialog
          open
          mode="edit"
          initial={{ name: 'ZOD', visibility: 'public', license: { id: 'other', name: 'Acme terms', url: 'https://acme.test/t' } }}
          busy={false}
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      );
      expect(screen.getByLabelText(/Licence name/)).toHaveValue('Acme terms');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ license: { id: 'other', name: 'Acme terms', url: 'https://acme.test/t' } })
      );
    });
  });
});
