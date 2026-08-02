import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/bundleService', () => ({
  listBundles: vi.fn(),
  createBundle: vi.fn(),
  deleteBundle: vi.fn(),
}));
vi.mock('../services/jobService', () => ({
  getMyGroups: vi.fn(),
}));

const uploadStart = vi.fn();
const uploadConfirm = vi.fn();
const uploadCancel = vi.fn();
const idleState = { phase: 'idle', uploadFraction: 0, preview: null, importJob: null, error: null };
let uploadState: Record<string, unknown> = { ...idleState };
vi.mock('../hooks/useBundleUpload', () => ({
  useBundleUpload: () => ({
    state: uploadState,
    start: uploadStart,
    confirm: uploadConfirm,
    cancel: uploadCancel,
  }),
}));

import { createBundle, deleteBundle, listBundles } from '../services/bundleService';
import { getMyGroups } from '../services/jobService';
import BundlesPage from './BundlesPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedList = listBundles as ReturnType<typeof vi.fn>;
const mockedCreate = createBundle as ReturnType<typeof vi.fn>;
const mockedDelete = deleteBundle as ReturnType<typeof vi.fn>;
const mockedGroups = getMyGroups as ReturnType<typeof vi.fn>;

const bundle = (overrides: Record<string, unknown> = {}) => ({
  _id: 'b1',
  name: 'Paper set',
  groupId: 'g1',
  status: 'ready',
  annotationSets: ['llava'],
  counts: { frames: 100, layers: 200 },
  manifest: [{ stem: 'a' }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  uploadState = { ...idleState };
  mockedList.mockResolvedValue([bundle()]);
  mockedGroups.mockResolvedValue([
    { groupId: 'g1', name: 'Team', role: 'admin' },
    { groupId: 'g2', name: 'Other', role: 'member' },
  ]);
});

describe('BundlesPage', () => {
  it('lists bundles with counts, sets, and manifest info', async () => {
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('Paper set')).toBeInTheDocument();
    expect(screen.getByText(/100 frames · 200 annotation images/)).toBeInTheDocument();
    expect(screen.getByText(/sets: llava/)).toBeInTheDocument();
    expect(screen.getByText(/manifest \(1 rows\)/)).toBeInTheDocument();
  });

  it('creates a bundle in an admin group', async () => {
    mockedCreate.mockResolvedValue(bundle());
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'New bundle' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New set' } });
    fireEvent.mouseDown(screen.getByLabelText('Group'));
    fireEvent.click(await screen.findByRole('option', { name: 'Team' })); // member-only group not offered
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith({ name: 'New set', groupId: 'g1' }));
  });

  it('starts a zip upload from the file input', async () => {
    renderWithProviders(<BundlesPage />);
    await screen.findByText('Paper set');

    const input = screen.getByTestId('zip-input-b1');
    const file = new File(['zip'], 'bundle.zip');
    fireEvent.change(input, { target: { files: [file] } });

    expect(uploadStart).toHaveBeenCalledWith(file);
  });

  it('shows import progress and file errors', async () => {
    uploadState = {
      ...idleState,
      phase: 'done',
      uploadFraction: 1,
      importJob: { processed: 99, skipped: 0, fileErrors: [{ path: 'frames/x.png', reason: 'Not a readable image' }] },
      error: null,
    };
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText(/1 file\(s\) had problems/)).toBeInTheDocument();
    expect(screen.getByText(/Not a readable image/)).toBeInTheDocument();
  });

  it('deletes a bundle and surfaces refusal errors', async () => {
    mockedDelete.mockRejectedValue(new Error('2 non-archived job(s) reference this bundle'));
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/non-archived job\(s\)/)).toBeInTheDocument();
  });
});

describe('BundlesPage upload phases and dialog', () => {
  it('shows the uploading progress bar', async () => {
    uploadState = { ...idleState, phase: 'uploading', uploadFraction: 0.42 };
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText(/Uploading zip… 42%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload zip' })).toBeDisabled();
  });

  it('shows the importing counter', async () => {
    uploadState = {
      ...idleState,
      phase: 'importing',
      uploadFraction: 1,
      importJob: { processed: 240, skipped: 12, fileErrors: [] },
      error: null,
    };
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText(/Importing… 240 files \(12 skipped\)/)).toBeInTheDocument();
  });

  it('shows failed uploads', async () => {
    uploadState = { ...idleState, phase: 'failed', error: 'Zip upload cancelled' };
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('Zip upload cancelled')).toBeInTheDocument();
  });

  it('disables New bundle without an admin group and cancels the dialog', async () => {
    mockedGroups.mockResolvedValue([{ groupId: 'g2', name: 'Other', role: 'member' }]);
    renderWithProviders(<BundlesPage />);

    await screen.findByText('Paper set');
    await waitFor(() => expect(screen.getByRole('button', { name: 'New bundle' })).toBeDisabled());
  });

  it('shows the inspecting phase while the zip is being read', async () => {
    uploadState = { ...idleState, phase: 'inspecting', uploadFraction: 1 };
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('Reading the zip…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload zip' })).toBeDisabled();
  });

  it('opens the mapping dialog and imports with the confirmed mapping', async () => {
    uploadState = {
      ...idleState,
      phase: 'mapping',
      uploadFraction: 1,
      preview: {
        entries: 3,
        truncated: false,
        folders: [
          { path: 'img', files: 2, images: 2, idMaps: 0, maskFiles: 0, others: 0, samples: ['a.jpg'] },
          { path: 'seg', files: 1, images: 0, idMaps: 1, maskFiles: 0, others: 0, samples: ['a.ids.png'] },
        ],
        manifestCandidates: [],
        suggestion: { frames: 'img', annotations: [{ path: 'seg', set: 'seg' }] },
      },
    };
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('Map the zip folders')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(uploadConfirm).toHaveBeenCalledWith({
      frames: 'img',
      annotations: [{ path: 'seg', set: 'seg' }],
    });
  });

  it('cancelling the mapping dialog abandons the upload', async () => {
    uploadState = {
      ...idleState,
      phase: 'mapping',
      uploadFraction: 1,
      preview: {
        entries: 1,
        truncated: false,
        folders: [{ path: 'frames', files: 1, images: 1, idMaps: 0, maskFiles: 0, others: 0, samples: ['a.jpg'] }],
        manifestCandidates: [],
        suggestion: { frames: 'frames', annotations: [] },
      },
    };
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(uploadCancel).toHaveBeenCalled();
  });

  it('empty state renders when there are no bundles', async () => {
    mockedList.mockResolvedValue([]);
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('No bundles yet')).toBeInTheDocument();
  });
});
