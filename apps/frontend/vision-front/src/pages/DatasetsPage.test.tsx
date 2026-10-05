import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

const service = vi.hoisted(() => ({
  listDatasets: vi.fn(),
  createDataset: vi.fn(),
  uploadArchive: vi.fn(),
  getDownloadUrl: vi.fn(),
  listMyGroups: vi.fn(),
  listLicenses: vi.fn(),
  listTrash: vi.fn(),
  restoreDataset: vi.fn(),
  deleteDatasetForever: vi.fn()
}));
vi.mock('../services/datasetService', () => service);
const useAuthMock = vi.hoisted(() => vi.fn());
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { resetDatasetUploads } from '../services/datasetUploads';
import DatasetsPage from './DatasetsPage';
import { renderWithClient } from '../test/renderWithClient';

const dataset = (overrides = {}) => ({
  _id: 'd1', name: 'ZOD', owner: { kind: 'user', id: 'u1' }, visibility: 'public', groups: [], imageCount: 87279, usedBy: 0,
  permissions: { read: true, contribute: true, manage: true, own: true },
  archive: { filename: 'zod.zip', size: 3.6 * 1024 ** 3, uploadedAt: '2026-09-01T00:00:00Z' },
  coverUrl: 'cover.jpg', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', ...overrides
});

const submitCreate = async (file = new File(['zip'], 'vlm.zip')) => {
  fireEvent.click(screen.getByRole('button', { name: 'New dataset' }));
  fireEvent.change(await screen.findByTestId('dataset-zip-input'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
  return file;
};

describe('DatasetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDatasetUploads();
    useAuthMock.mockReturnValue({ isAuthenticated: true, user: { id: 'u1' } });
    service.listDatasets.mockResolvedValue({
      datasets: [
        dataset(),
        dataset({ _id: 'd2', name: 'Team set', visibility: 'private', owner: { kind: 'group', id: 'g1' }, archive: undefined, coverUrl: undefined, imageCount: 0, import: { status: 'running' } }),
        dataset({ _id: 'd3', name: 'Migrated', archive: { filename: 'upload.zip', uploadedAt: '2026-09-01T00:00:00Z' }, imageCount: 5, uploading: { filename: 'next.zip' }, scan: { status: 'failed' }, contents: undefined }),
        dataset({ _id: 'd4', name: 'Fresh', imageCount: 0, archive: { filename: 'fresh.zip', uploadedAt: '2026-09-01T00:00:00Z' }, scan: { status: 'running' } })
      ],
      pagination: { page: 1, limit: 24, total: 30, pages: 2 }
    });
    service.listMyGroups.mockResolvedValue([{ id: 'g1', name: 'Team', role: 'admin' }]);
    service.listLicenses.mockResolvedValue([{ id: 'mit', name: 'MIT' }, { id: 'other', name: 'Other' }]);
  });

  it('lists datasets with size, images, owner and import state', async () => {
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    expect(await screen.findByText('ZOD')).toBeInTheDocument();
    expect(screen.getByText(/3\.6 GB · 87,279 images/)).toBeInTheDocument();
    expect(screen.getByText(/No zip yet/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Owner: Team')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Owner: Me')).toHaveLength(3);
    expect(screen.getAllByText('Public')).toHaveLength(3);
    expect(screen.getByText('Importing')).toBeInTheDocument();
    expect(screen.getByText(/upload\.zip · 5 images/)).toBeInTheDocument();
    expect(screen.getByText('Upload interrupted')).toBeInTheDocument();
    expect(screen.getByText('Unreadable zip')).toBeInTheDocument();
    expect(screen.getByText('Reading zip')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Download/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(service.listDatasets).toHaveBeenLastCalledWith({ search: undefined, owner: undefined, page: 2, limit: 24 }));
    fireEvent.change(screen.getByLabelText('Search datasets'), { target: { value: 'zod' } });
    await waitFor(() => expect(service.listDatasets).toHaveBeenLastCalledWith({ search: 'zod', owner: undefined, page: 1, limit: 24 }));
  });

  it('downloads a zip and opens a dataset', async () => {
    service.getDownloadUrl.mockRejectedValue(new Error('No zip'));
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    fireEvent.click(await screen.findByRole('button', { name: 'Download ZOD' }));
    expect(await screen.findByText('No zip')).toBeInTheDocument();
    fireEvent.click(screen.getByText('ZOD'));
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
  });

  it('creates, uploads, then continues on the new dataset', async () => {
    service.createDataset.mockResolvedValue(dataset({ _id: 'new' }));
    service.uploadArchive.mockImplementation(async (_id: string, _file: File, onProgress: (n: number) => void) => onProgress(0.5));
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    await screen.findByText('ZOD');
    const file = await submitCreate();
    await waitFor(() => expect(screen.getByTestId('elsewhere')).toBeInTheDocument());
    expect(service.createDataset).toHaveBeenCalledWith({ name: 'vlm', description: '', visibility: 'private', owner: { kind: 'user', id: 'u1' } });
    expect(service.uploadArchive).toHaveBeenCalledWith('new', file, expect.any(Function), expect.any(AbortSignal));
  });

  it('opens the form from the menu\'s New (?create=1), for a signed-in user only', async () => {
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets?create=1' });
    expect(await screen.findByTestId('dataset-zip-input')).toBeInTheDocument();
  });

  it('does not open the form from ?create=1 for a visitor', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false });
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets?create=1' });
    await screen.findByText('ZOD');
    expect(screen.queryByTestId('dataset-zip-input')).not.toBeInTheDocument();
  });

  it('shows a refused create, and leaves a failed upload to the dataset page', async () => {
    service.createDataset.mockRejectedValueOnce(new Error('Name taken'));
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    await screen.findByText('ZOD');
    await submitCreate();
    expect(await screen.findByText('Name taken')).toBeInTheDocument();

    service.createDataset.mockResolvedValueOnce(dataset({ _id: 'new' }));
    service.uploadArchive.mockRejectedValueOnce(new Error('network'));
    fireEvent.click(screen.getByRole('button', { name: 'Create and upload' }));
    await waitFor(() => expect(screen.getByTestId('elsewhere')).toBeInTheDocument());
  });

  it('hides creation from visitors and says when there is nothing', async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false });
    service.listDatasets.mockResolvedValue({ datasets: [], pagination: { page: 1, limit: 24, total: 0, pages: 0 } });
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    expect(await screen.findByText('No datasets yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New dataset' })).not.toBeInTheDocument();
  });

  it('offers a signed-in user their first upload', async () => {
    service.listDatasets.mockResolvedValue({ datasets: [], pagination: { page: 1, limit: 24, total: 0, pages: 0 } });
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload dataset' }));
    expect(await screen.findByRole('dialog', { name: 'New dataset' })).toBeInTheDocument();
  });

  it('narrows the list to one owner', async () => {
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    await screen.findByText('ZOD');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Owner/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Team' }));
    await waitFor(() => expect(service.listDatasets).toHaveBeenLastCalledWith({ search: undefined, owner: 'g1', page: 1, limit: 24 }));
    service.listDatasets.mockResolvedValue({ datasets: [], pagination: { page: 1, limit: 24, total: 0, pages: 0 } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Owner/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Me' }));
    expect(await screen.findByText('No dataset matches that search.')).toBeInTheDocument();
    expect(service.listDatasets).toHaveBeenLastCalledWith({ search: undefined, owner: 'me', page: 1, limit: 24 });
  });

  it('restores from the trash, and deletes forever after confirmation', async () => {
    const trashedAt = '2026-09-01T00:00:00Z';
    service.listTrash.mockResolvedValue([
      dataset({ _id: 't1', name: 'Old scans', trashedAt }),
      dataset({ _id: 't2', name: 'Team leftovers', trashedAt, owner: { kind: 'group', id: 'g1' }, permissions: { read: true, contribute: true, manage: true, own: false } })
    ]);
    service.restoreDataset.mockRejectedValueOnce(new Error('Not now')).mockResolvedValueOnce(dataset({ _id: 't1' }));
    service.deleteDatasetForever.mockResolvedValue(undefined);
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    await screen.findByText('ZOD');
    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));

    expect(await screen.findByText('Old scans')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New dataset' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only its owner can restore it/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('Not now')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(service.restoreDataset).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(service.deleteDatasetForever).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'All datasets' }));
    expect(await screen.findByText('ZOD')).toBeInTheDocument();
  });

  it('says when the trash is empty', async () => {
    service.listTrash.mockResolvedValue([]);
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets?view=trash' });
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
  });

  it('reports a failed list', async () => {
    service.listDatasets.mockRejectedValue(new Error('dataset-service down'));
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    expect(await screen.findByText('dataset-service down')).toBeInTheDocument();
  });
});
