import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({
  listDatasets: vi.fn(),
  createDataset: vi.fn(),
  uploadArchive: vi.fn(),
  getDownloadUrl: vi.fn(),
  listMyGroups: vi.fn()
}));
vi.mock('../services/datasetService', () => service);
const useAuthMock = vi.hoisted(() => vi.fn());
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import DatasetsPage from './DatasetsPage';
import { renderWithClient } from '../test/renderWithClient';

const dataset = (overrides = {}) => ({
  _id: 'd1', name: 'ZOD', ownerId: 'u1', visibility: 'public', groups: [], imageCount: 87279, usedBy: 0, canWrite: true,
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
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    service.listDatasets.mockResolvedValue({
      datasets: [
        dataset(),
        dataset({ _id: 'd2', name: 'Team set', visibility: 'group', archive: undefined, coverUrl: undefined, imageCount: 0, import: { status: 'running' } }),
        dataset({ _id: 'd3', name: 'Migrated', archive: { filename: 'upload.zip', uploadedAt: '2026-09-01T00:00:00Z' }, imageCount: 5, uploading: { filename: 'next.zip' }, scan: { status: 'failed' }, contents: undefined }),
        dataset({ _id: 'd4', name: 'Fresh', imageCount: 0, archive: { filename: 'fresh.zip', uploadedAt: '2026-09-01T00:00:00Z' }, scan: { status: 'running' } })
      ],
      pagination: { page: 1, limit: 24, total: 30, pages: 2 }
    });
    service.listMyGroups.mockResolvedValue([]);
  });

  it('lists datasets with size, images, sharing and import state', async () => {
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    expect(await screen.findByText('ZOD')).toBeInTheDocument();
    expect(screen.getByText(/3\.6 GB · 87,279 images/)).toBeInTheDocument();
    expect(screen.getByText(/No zip yet/)).toBeInTheDocument();
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.getByText('Importing')).toBeInTheDocument();
    expect(screen.getByText(/upload\.zip · 5 images/)).toBeInTheDocument();
    expect(screen.getByText('Upload interrupted')).toBeInTheDocument();
    expect(screen.getByText('Unreadable zip')).toBeInTheDocument();
    expect(screen.getByText('Reading zip')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Download/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(service.listDatasets).toHaveBeenLastCalledWith({ search: undefined, page: 2, limit: 24 }));
    fireEvent.change(screen.getByLabelText('Search datasets'), { target: { value: 'zod' } });
    await waitFor(() => expect(service.listDatasets).toHaveBeenLastCalledWith({ search: 'zod', page: 1, limit: 24 }));
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
    expect(service.createDataset).toHaveBeenCalledWith({ name: 'vlm', description: '', visibility: 'public', groupId: undefined });
    expect(service.uploadArchive).toHaveBeenCalledWith('new', file, expect.any(Function));
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

  it('reports a failed list', async () => {
    service.listDatasets.mockRejectedValue(new Error('dataset-service down'));
    renderWithClient(<DatasetsPage />, { route: '/datasets', path: '/datasets' });
    expect(await screen.findByText('dataset-service down')).toBeInTheDocument();
  });
});
