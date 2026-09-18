import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

const service = vi.hoisted(() => ({
  getDataset: vi.fn(),
  updateDataset: vi.fn(),
  deleteDataset: vi.fn(),
  uploadArchive: vi.fn(),
  startImport: vi.fn(),
  cancelImport: vi.fn(),
  getDownloadUrl: vi.fn(),
  listItems: vi.fn(),
  listMyGroups: vi.fn(),
  scanArchive: vi.fn()
}));
vi.mock('../services/datasetService', () => service);

import DatasetDetailPage from './DatasetDetailPage';
import { renderWithClient } from '../test/renderWithClient';

const contents = {
  entries: 3, totalBytes: 30, truncated: false, extensions: [{ ext: '.png', files: 2, bytes: 20 }],
  folders: [
    { path: '', depth: 0, files: 3, images: 2, jsons: 0, bytes: 30 },
    { path: 'frames', depth: 1, files: 2, images: 2, jsons: 0, bytes: 20 }
  ]
};
const dataset = (overrides = {}) => ({
  _id: 'd1', name: 'VLM', description: 'Mask review set', ownerId: 'u1', visibility: 'public', groups: [{ name: 'frames', images: 2, jsons: 0 }],
  imageCount: 2, usedBy: 0, canWrite: true, contents,
  archive: { filename: 'vlm.zip', size: 2048, uploadedAt: '2026-09-01T00:00:00Z' },
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', ...overrides
});

const renderPage = (state?: unknown) => renderWithClient(<DatasetDetailPage />, { route: '/datasets/:id', path: '/datasets/d1', state });

describe('DatasetDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getDataset.mockResolvedValue(dataset());
    service.listItems.mockResolvedValue({ items: [], pagination: { page: 1, limit: 60, total: 0, pages: 0 } });
    service.listMyGroups.mockResolvedValue([]);
  });

  it('shows the dataset, its contents and its images', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'VLM' })).toBeInTheDocument();
    expect(screen.getByText(/vlm\.zip · 2\.0 KB · 2 images/)).toBeInTheDocument();
    expect(screen.getByText('Mask review set')).toBeInTheDocument();
    expect(screen.getByText('Visible to everyone')).toBeInTheDocument();
    expect(screen.getByText('Contents')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Images' })).toBeInTheDocument();
    await waitFor(() => expect(service.listItems).toHaveBeenCalledWith('d1', expect.objectContaining({ kind: 'image' })));
  });

  it('edits details and reports a refusal inside the dialog', async () => {
    service.updateDataset.mockRejectedValueOnce(new Error('Not allowed')).mockResolvedValueOnce(dataset({ name: 'VLM v2' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: 'VLM v2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Not allowed')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'VLM v2' })).toBeInTheDocument();
    expect(service.updateDataset).toHaveBeenLastCalledWith('d1', { name: 'VLM v2', description: 'Mask review set', visibility: 'public', groupId: undefined });
  });

  it('replaces the zip, then goes on to choosing image groups and importing', async () => {
    service.uploadArchive.mockResolvedValue(dataset());
    service.startImport.mockResolvedValue(dataset({ import: { id: 'i', status: 'done', mapping: { groups: [] }, processed: 2, skipped: 0, errors: [], stale: false } }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace zip' }));
    fireEvent.change(await screen.findByTestId('dataset-zip-input'), { target: { files: [new File(['z'], 'new.zip')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Choose image groups')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 group' }));
    await waitFor(() => expect(service.startImport).toHaveBeenCalledWith('d1', { groups: [{ folder: 'frames', group: 'frames' }] }));
  });

  it('opens group choice straight after creation', async () => {
    service.getDataset.mockResolvedValue(dataset({ imageCount: 0, groups: [] }));
    renderPage({ chooseGroups: true });
    expect(await screen.findByText('Choose image groups')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/No images shown yet/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Choose image groups')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Choose folders' }));
    expect(await screen.findByText('Choose image groups')).toBeInTheDocument();
  });

  it('shows an upload that failed after the dataset was created', async () => {
    service.getDataset.mockResolvedValue(dataset({ archive: undefined, contents: undefined, imageCount: 0, groups: [] }));
    renderPage({ uploadError: 'Upload interrupted' });
    expect(await screen.findByText('Upload interrupted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Upload interrupted')).not.toBeInTheDocument();
  });

  it('polls a running import and cancels it', async () => {
    service.getDataset.mockResolvedValue(dataset({ import: { id: 'i', status: 'running', mapping: { groups: [] }, processed: 5, skipped: 0, errors: [], stale: false } }));
    service.cancelImport.mockResolvedValue(dataset({ import: { id: 'i', status: 'cancelled', mapping: { groups: [] }, processed: 5, skipped: 0, errors: [], stale: false } }));
    renderPage();
    expect(await screen.findByText(/Importing images… 5 stored/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Image groups' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('The last import was cancelled.')).toBeInTheDocument();
  });

  it('keeps a dataset labeling uses from being deleted or re-imported', async () => {
    service.getDataset.mockResolvedValue(dataset({ usedBy: 2, visibility: 'group' }));
    renderPage();
    expect(await screen.findByText('Used by 2 labeling jobs')).toBeInTheDocument();
    expect(screen.getByText('Shared with a group')).toBeInTheDocument();
    for (const name of ['Delete', 'Replace zip', 'Image groups']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('deletes after confirmation', async () => {
    service.deleteDataset.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByTestId('elsewhere')).toBeInTheDocument());
  });

  it('offers only download to a reader, and an upload to an empty dataset', async () => {
    service.getDataset.mockResolvedValueOnce(dataset({ canWrite: false, description: undefined }));
    service.getDownloadUrl.mockRejectedValue(new Error('Expired'));
    const { unmount } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Download zip' }));
    expect(await screen.findByText('Expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    unmount();

    service.getDataset.mockResolvedValueOnce(dataset({ archive: undefined, contents: undefined, imageCount: 0, groups: [] }));
    renderPage();
    expect(await screen.findByText(/No zip uploaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload zip' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Download zip' })).not.toBeInTheDocument();
  });

  it('scans the zip of a dataset that arrived without its contents', async () => {
    service.getDataset.mockResolvedValue(dataset({ archive: { filename: 'upload.zip', uploadedAt: '2026-09-01T00:00:00Z' }, contents: undefined }));
    service.scanArchive.mockResolvedValue(dataset());
    renderPage();
    expect(await screen.findByText(/upload\.zip · 2 images/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Scan zip' }));
    await waitFor(() => expect(service.scanArchive).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('Contents')).toBeInTheDocument();
  });

  it('explains a dataset that does not load', async () => {
    service.getDataset.mockRejectedValue(new Error('Dataset not found'));
    renderPage();
    expect(await screen.findByText('Dataset not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to datasets' }));
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
  });
});
