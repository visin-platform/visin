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
  scanArchive: vi.fn(),
  discardUpload: vi.fn(),
  setCover: vi.fn(),
  removeGroup: vi.fn()
}));
vi.mock('../services/datasetService', () => service);

import { resetDatasetUploads } from '../services/datasetUploads';
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
  imageCount: 2, usedBy: 0, canWrite: true, contents, removingGroups: [],
  archive: { filename: 'vlm.zip', size: 2048, uploadedAt: '2026-09-01T00:00:00Z' },
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', ...overrides
});

const renderPage = (state?: unknown) => renderWithClient(<DatasetDetailPage />, { route: '/datasets/:id', path: '/datasets/d1', state });

describe('DatasetDetailPage', () => {
  beforeEach(() => {
    // reset, not clear: a test's unconsumed mockResolvedValueOnce must not reach the next one
    vi.resetAllMocks();
    resetDatasetUploads();
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

  it('reads a new zip in the background, then goes on to choosing image groups', async () => {
    const scanning = dataset({ contents: undefined, imageCount: 0, groups: [], scan: { status: 'running' } });
    service.uploadArchive.mockResolvedValue(scanning);
    service.getDataset.mockResolvedValueOnce(dataset()).mockResolvedValue(dataset({ scan: { status: 'done' } }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace zip' }));
    fireEvent.change(await screen.findByTestId('dataset-zip-input'), { target: { files: [new File(['z'], 'new.zip')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText(/you can leave this page/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Image groups' })).toBeDisabled());
    expect(screen.queryByText('Choose image groups')).not.toBeInTheDocument();
    expect(await screen.findByText('Choose image groups', undefined, { timeout: 5000 })).toBeInTheDocument();
  }, 10_000);

  it('offers another scan when reading the zip failed', async () => {
    service.getDataset.mockResolvedValue(dataset({ contents: undefined, scan: { status: 'failed', error: 'not a zip' } }));
    service.scanArchive.mockResolvedValue(dataset({ contents: undefined, scan: { status: 'queued' } }));
    renderPage({ chooseGroups: true });
    expect(await screen.findByText('The zip could not be read: not a zip')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    expect(await screen.findByText(/you can leave this page/)).toBeInTheDocument();
    expect(screen.queryByText('Choose image groups')).not.toBeInTheDocument();
  });

  it('resumes an interrupted upload with the same zip', async () => {
    service.getDataset.mockResolvedValue(dataset({ uploading: { filename: 'zod.zip', size: 4096 } }));
    service.uploadArchive.mockResolvedValue(dataset({ contents: undefined, scan: { status: 'queued' } }));
    renderPage();
    expect(await screen.findByText(/The upload of zod\.zip stopped before it finished/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Resume upload')).toBeInTheDocument();
    expect(within(dialog).getByText(/Choose zod\.zip \(4\.0 KB\) again/)).toBeInTheDocument();
    const file = new File(['z'], 'zod.zip');
    fireEvent.change(within(dialog).getByTestId('dataset-zip-input'), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(service.uploadArchive).toHaveBeenCalledWith('d1', file, expect.any(Function), expect.any(AbortSignal)));
    expect(await screen.findByText(/you can leave this page/)).toBeInTheDocument();
  });

  it('discards an interrupted upload, keeping the current zip', async () => {
    service.getDataset.mockResolvedValue(dataset({ uploading: { filename: 'zod.zip' } }));
    service.discardUpload.mockRejectedValueOnce(new Error('file-service down')).mockResolvedValueOnce(dataset());
    renderPage();
    expect(await screen.findByText(/The current zip stays in place/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('file-service down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByText(/stopped before it finished/)).not.toBeInTheDocument());
    expect(service.discardUpload).toHaveBeenCalledTimes(2);
  });

  it('picks the open image as the dataset cover', async () => {
    const frame = { _id: 'f1', group: 'frames', path: 'frames/0001.png', stem: '0001', kind: 'image', size: 1, url: 'u', thumbnailUrl: 't' };
    service.listItems.mockResolvedValue({ items: [frame], pagination: { page: 1, limit: 60, total: 1, pages: 1 } });
    service.setCover.mockRejectedValueOnce(new Error('Not allowed')).mockResolvedValueOnce(dataset({ coverPath: 'frames/0001.png' }));
    renderPage();
    fireEvent.click(await screen.findByAltText('frames/0001.png'));
    fireEvent.click(await screen.findByRole('button', { name: 'Use as cover' }));
    await waitFor(() => expect(service.setCover).toHaveBeenCalledWith('d1', 'f1'));
    fireEvent.click(screen.getByRole('button', { name: 'Use as cover' }));
    expect(await screen.findByText('Dataset cover')).toBeInTheDocument();
  });

  it('removes an image group in the background', async () => {
    const groups = [{ name: 'camera', images: 2300, jsons: 0 }, { name: 'lidar_png', images: 2300, jsons: 0 }];
    service.getDataset.mockResolvedValue(dataset({ groups }));
    service.removeGroup.mockResolvedValue(dataset({ groups: [groups[0]], removingGroups: ['lidar_png'] }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove a group' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText('lidar_png — 2,300 images'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove 2,300 images' }));
    await waitFor(() => expect(service.removeGroup).toHaveBeenCalledWith('d1', 'lidar_png'));
    expect(await screen.findByText(/Removing lidar_png in the background/)).toBeInTheDocument();
  });

  it('explains a dataset that does not load', async () => {
    service.getDataset.mockRejectedValue(new Error('Dataset not found'));
    renderPage();
    expect(await screen.findByText('Dataset not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to datasets' }));
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
  });
});
