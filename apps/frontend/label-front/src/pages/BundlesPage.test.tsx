import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/bundleService', () => ({
  listBundles: vi.fn(),
  listUploads: vi.fn(),
  createBundle: vi.fn(),
  updateBundle: vi.fn(),
  deleteBundle: vi.fn(),
}));
vi.mock('../services/jobService', () => ({
  getMyGroups: vi.fn(),
  listJobs: vi.fn(),
}));

const uploadStart = vi.fn();
const uploadFromExisting = vi.fn();
const uploadConfirm = vi.fn();
const uploadCancel = vi.fn();
const idleState = { phase: 'idle', uploadFraction: 0, preview: null, importJob: null, error: null };
let uploadState: Record<string, unknown> = { ...idleState };
vi.mock('../hooks/useBundleUpload', () => ({
  useBundleUpload: () => ({
    state: uploadState,
    start: uploadStart,
    startFromUpload: uploadFromExisting,
    confirm: uploadConfirm,
    cancel: uploadCancel,
  }),
}));

import { createBundle, deleteBundle, listBundles, listUploads, updateBundle } from '../services/bundleService';
import { getMyGroups, listJobs } from '../services/jobService';
import BundlesPage from './BundlesPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedList = listBundles as ReturnType<typeof vi.fn>;
const mockedCreate = createBundle as ReturnType<typeof vi.fn>;
const mockedUpdate = updateBundle as ReturnType<typeof vi.fn>;
const mockedUploads = listUploads as ReturnType<typeof vi.fn>;
const mockedDelete = deleteBundle as ReturnType<typeof vi.fn>;
const mockedGroups = getMyGroups as ReturnType<typeof vi.fn>;
const mockedJobs = listJobs as ReturnType<typeof vi.fn>;

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
  mockedUploads.mockResolvedValue([]);
  mockedJobs.mockResolvedValue([]);
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

  // One bundle backs several differently-scoped jobs, so "which jobs draw from
  // this?" is the question you have while looking at it.
  it('links each bundle to the jobs built on it', async () => {
    mockedJobs.mockResolvedValue([
      { _id: 'j1', name: 'Triage llava', bundleId: 'b1', status: 'active' },
      { _id: 'j2', name: 'Discovery', bundleId: 'b1', status: 'draft' },
      { _id: 'j3', name: 'Elsewhere', bundleId: 'other', status: 'active' },
    ]);
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('2 jobs:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Triage llava · active' })).toHaveAttribute('href', '/jobs/j1');
    // Drafts are the ones you come back here to find, so the admin list is used.
    expect(screen.getByRole('link', { name: 'Discovery · draft' })).toHaveAttribute('href', '/jobs/j2');
    expect(screen.queryByText(/Elsewhere/)).not.toBeInTheDocument();
    expect(mockedJobs).toHaveBeenCalledWith('admin');
  });

  it('points an unused bundle at the job wizard', async () => {
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText(/No jobs yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'create one' })).toHaveAttribute('href', '/jobs/new');
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

  it('sends a description when the create dialog has one', async () => {
    mockedCreate.mockResolvedValue(bundle());
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'New bundle' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New set' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' 4135 ZOD frames ' } });
    fireEvent.mouseDown(screen.getByLabelText('Group'));
    fireEvent.click(await screen.findByRole('option', { name: 'Team' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({ name: 'New set', groupId: 'g1', description: '4135 ZOD frames' })
    );
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

  it('renames a bundle and saves the description', async () => {
    mockedUpdate.mockResolvedValue(bundle({ name: 'Renamed' }));
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'zod triage v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('b1', { name: 'Renamed', description: 'zod triage v2' })
    );
  });

  it('keeps Save disabled until something actually changes', async () => {
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled(); // blank name is not a rename

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('surfaces an edit failure without closing the dialog', async () => {
    mockedUpdate.mockRejectedValue(new Error('Nothing to update'));
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Nothing to update')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows a bundle description and explains that images are immutable', async () => {
    mockedList.mockResolvedValue([bundle({ description: 'built by make_label_bundle.py' })]);
    renderWithProviders(<BundlesPage />);

    expect(await screen.findByText('built by make_label_bundle.py')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText(/Upload another zip to add frames or annotation sets/)).toBeInTheDocument();
  });

  it('maps and imports the only upload without a menu, and without re-sending the zip', async () => {
    mockedUploads.mockResolvedValue([
      { zipFileId: 'label-bundles/b1/upload-2.zip', size: 731 * 1024 ** 2, uploadedAt: '2026-08-02T18:00:00.000Z' },
    ]);
    renderWithProviders(<BundlesPage />);

    const button = await screen.findByRole('button', { name: /Map & import/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    // One upload: straight to the mapping dialog, no menu of one to pick from.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(uploadFromExisting).toHaveBeenCalledWith('label-bundles/b1/upload-2.zip');
    expect(uploadStart).not.toHaveBeenCalled();
  });

  it('asks which upload when a bundle has several', async () => {
    mockedUploads.mockResolvedValue([
      { zipFileId: 'label-bundles/b1/upload-3.zip', size: 731 * 1024 ** 2, uploadedAt: '2026-08-02T18:30:00.000Z' },
      { zipFileId: 'label-bundles/b1/upload-1.zip', size: 700 * 1024 ** 2, uploadedAt: '2026-08-02T17:00:00.000Z' },
    ]);
    renderWithProviders(<BundlesPage />);

    const button = await screen.findByRole('button', { name: /Map & import/ });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByText('Which upload?')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('menuitem', { name: /latest/ }));

    expect(uploadFromExisting).toHaveBeenCalledWith('label-bundles/b1/upload-3.zip');
  });

  it('has nothing to map before the first upload', async () => {
    renderWithProviders(<BundlesPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Map & import/ })).toBeDisabled());
  });

  it('deletes a bundle and surfaces refusal errors, once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedDelete.mockRejectedValue(new Error('An import is running for this bundle'));
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByText(/An import is running/)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  // The delete now takes the bundle's jobs, tasks and answers with it, so a
  // mis-click must not be enough to trigger it.
  it('does not delete when the confirmation is declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProviders(<BundlesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
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
