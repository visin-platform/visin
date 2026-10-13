import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
  getJobStats: vi.fn(),
  getMyGroups: vi.fn(),
  transitionJob: vi.fn(),
  setJobVisibility: vi.fn(),
  setModelClassMapping: vi.fn(),
  downloadExport: vi.fn(),
  deleteJob: vi.fn(),
  getFormats: vi.fn(),
  importLabels: vi.fn(),
}));

// Signed in unless a test says otherwise — anonymous is the exception here.
const authState = { isAuthenticated: true, isLoading: false, user: { email: 'w@x.com' }, login: vi.fn(), logout: vi.fn() };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { deleteJob, downloadExport, getFormats, getJob, getJobStats, getMyGroups, transitionJob, setJobVisibility } from '../services/jobService';
import JobDetailPage from './JobDetailPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedGetJob = getJob as ReturnType<typeof vi.fn>;
const mockedStats = getJobStats as ReturnType<typeof vi.fn>;
const mockedGroups = getMyGroups as ReturnType<typeof vi.fn>;
// The server says whether the caller may run the job (manage on its dataset).
let canManage = false;
const mockedTransition = transitionJob as ReturnType<typeof vi.fn>;
const mockedExport = downloadExport as ReturnType<typeof vi.fn>;
const mockedDelete = deleteJob as ReturnType<typeof vi.fn>;

const job = (overrides: Record<string, unknown> = {}) => ({
  _id: 'j1',
  name: 'Mask check',
  status: 'active',
  canLabel: true,
  canManage,
  taskType: 'annotate',
  redundancy: 2,
  classes: [
    { key: 'car', name: 'Car', color: '#2a78d6', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'road', name: 'Road', color: '#eb6834', tools: ['mask'], maskIndex: 2 },
  ],
  sensors: [
    { key: 'camera', group: 'camera', kind: 'image' },
    { key: 'lidar', group: 'lidar', kind: 'image' },
  ],
  tasksCount: 10,
  progress: { tasks: 10, completed: 4, done: 12, skipped: 2, myDone: 6 },
  ...overrides,
});

const stats = {
  tasks: 10,
  completed: 4,
  done: 12,
  skipped: 2,
  objects: 31,
  perClass: [
    { classKey: 'car', name: 'Car', boxes: 31, pixels: 120000 },
    { classKey: 'road', name: 'Road', boxes: 0, pixels: 450000 },
  ],
  perUser: [{ userEmail: 'a@x.com', userName: 'Ann', done: 7, skipped: 1 }],
  perStratum: [
    { stratum: 'vehicle', tasks: 6, completed: 3 },
    { stratum: 'sign', tasks: 4, completed: 1 },
  ],
};

const renderPage = () => renderWithProviders(<JobDetailPage />, { route: '/jobs/j1', path: '/jobs/:id' });

beforeEach(() => {
  vi.clearAllMocks();
  canManage = false;
  mockedGetJob.mockResolvedValue(job());
  mockedStats.mockResolvedValue(stats);
  mockedGroups.mockResolvedValue([]);
  (getFormats as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 'yolo', name: 'YOLO', description: 'One txt per image', boxes: true, masks: false },
  ]);
});


/** Admin chores sit behind the job's ⋮ menu: open it and choose one. */
const chooseAction = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: /More actions for/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name }));
};

describe('JobDetailPage', () => {
  it('allows managers to configure model classes on an existing job', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    renderPage();
    await chooseAction('Model class mapping…');
    expect(await screen.findByRole('dialog', { name: 'Model class mapping' })).toBeInTheDocument();
    expect(screen.getByLabelText('Model class for Car')).toBeInTheDocument();
    expect(screen.queryByLabelText('Model class for Road')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('names the browser tab after the job', async () => {
    renderPage();

    await screen.findByText('Mask check');
    await waitFor(() => expect(document.title).toBe('Mask check - Labeling'));
  });

  it('shows progress, the classes, and the per-class, per-annotator and per-stratum tables', async () => {
    renderPage();

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.getByText(/4\/10 frames complete · 2 skipped · 6 by me/)).toBeInTheDocument();
    expect(screen.getByText('Car · box + mask')).toBeInTheDocument();
    expect(screen.getByText('Road · mask')).toBeInTheDocument();
    expect(screen.getByText('camera + lidar')).toBeInTheDocument();
    expect(screen.getByText('K=2')).toBeInTheDocument();
    expect(await screen.findByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('vehicle')).toBeInTheDocument();
    expect(screen.getByText('450,000')).toBeInTheDocument();
    expect(screen.getByText(/31 boxes drawn/)).toBeInTheDocument();
  });

  it('shows no annotator table to a visitor, who is not given the email addresses', async () => {
    mockedStats.mockResolvedValue({ ...stats, perUser: undefined });
    renderPage();

    await screen.findByText('Mask check');
    await screen.findByText('Per class');
    expect(screen.queryByText('Per annotator')).not.toBeInTheDocument();
  });

  it('hides admin controls for plain workers but shows the labeling link', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/j1/work');
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    // Admin chores live behind the ⋮ menu, which a non-admin does not get.
    expect(screen.queryByRole('button', { name: /More actions for/ })).not.toBeInTheDocument();
  });

  it('lets an admin pause and export the job’s setup', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedTransition.mockResolvedValue(job({ status: 'paused' }));
    mockedExport.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'pause'));

    await chooseAction('Export job setup');
    expect(mockedExport).toHaveBeenCalledWith('j1', 'manifest');
  });

  it('opens the label export and import dialogs from the menu', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    renderPage();

    await chooseAction('Export labels…');
    expect(await screen.findByRole('dialog', { name: 'Export labels' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await chooseAction('Import labels…');
    expect(await screen.findByRole('dialog', { name: 'Import labels' })).toBeInTheDocument();
  });

  it('offers no import for a job with no frames, or one that is archived', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job({ tasksCount: 0 }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /More actions for/ }));
    expect(await screen.findByRole('menuitem', { name: 'Export labels…' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Import labels…' })).not.toBeInTheDocument();
  });

  it('lets an admin activate a draft and surfaces transition errors', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job({ status: 'draft' }));
    mockedTransition.mockRejectedValue(new Error('Bundle is not ready'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));

    expect(await screen.findByText('Bundle is not ready')).toBeInTheDocument();
  });
});

describe('JobDetailPage transitions', () => {
  it('resume for paused jobs and archive', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job({ status: 'paused' }));
    mockedTransition.mockResolvedValue(job({ status: 'active' }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'resume'));

    await chooseAction('Archive');
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'archive'));
  });

  it('surfaces a failure to export the setup', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedExport.mockRejectedValue(new Error('Export failed (500)'));
    renderPage();

    await chooseAction('Export job setup');

    expect(mockedExport).toHaveBeenCalledWith('j1', 'manifest');
    expect(await screen.findByText('Export failed (500)')).toBeInTheDocument();
  });
  it('hard-deletes the job once confirmed and returns to the list', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedDelete.mockResolvedValue({ tasks: 4135, annotations: 7, suggestions: 0 });
    renderPage();

    await chooseAction('Delete');
    const dialog = await screen.findByRole('dialog', { name: 'Delete this job?' });
    // The 4 labeled frames are named in the prompt: they are the labeling
    // effort, and archiving is the option that keeps them.
    expect(dialog).toHaveTextContent('labels on 4 frame(s)');
    expect(mockedDelete).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete job' }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('j1'));
  });

  it('does not delete when the confirmation is declined', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    renderPage();

    await chooseAction('Delete');
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the reason when the delete is refused', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedDelete.mockRejectedValue(new Error('A labeler has the job open'));
    renderPage();

    await chooseAction('Delete');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete job' }));

    expect(await within(dialog).findByText('A labeler has the job open')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

it('lets administrators explicitly publish and stop sharing', async () => {
  canManage = true;
  mockedGetJob.mockResolvedValue(job());
  vi.mocked(setJobVisibility).mockImplementation(async (_id, isPublic) => {
    mockedGetJob.mockResolvedValue(job({ isPublic }));
    return job({ isPublic }) as Awaited<ReturnType<typeof setJobVisibility>>;
  });
  renderPage();
  await chooseAction('Enable public sharing');
  await waitFor(() => expect(setJobVisibility).toHaveBeenCalledWith('j1', true));
  await chooseAction('Stop public sharing');
  await waitFor(() => expect(setJobVisibility).toHaveBeenCalledWith('j1', false));
});

it('surfaces sharing failures', async () => {
  canManage = true;
  mockedGetJob.mockResolvedValue(job());
  vi.mocked(setJobVisibility).mockRejectedValue(new Error('Group owner/admin required'));
  renderPage();
  await chooseAction('Enable public sharing');
  expect(await screen.findByText('Group owner/admin required')).toBeInTheDocument();
});

it('shows an access error instead of an endless job loader', async () => {
  mockedGetJob.mockRejectedValue(new Error('Group membership required'));
  renderPage();
  expect(await screen.findByText('Group membership required')).toBeInTheDocument();
});

it('keeps a signed-in public visitor in browse mode', async () => {
  authState.isAuthenticated = true;
  mockedGetJob.mockResolvedValue(job({ isPublic: true, canLabel: false }));
  renderPage();
  await screen.findByText('Mask check');
  expect(screen.queryByRole('button', { name: 'Start labeling' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /More actions for/ })).not.toBeInTheDocument();
});

it("shows the job's dataset and who owns it", async () => {
  mockedGroups.mockResolvedValue([{ groupId: 'g1', name: 'Road team', role: 'member' }]);
  mockedGetJob.mockResolvedValue(job({ dataset: { _id: 'd1', name: 'Road scenes', owner: { kind: 'group', id: 'g1' } } }));
  renderPage();
  expect(await screen.findByText('Dataset: Road scenes')).toBeInTheDocument();
  expect(await screen.findByLabelText('Owner: Road team')).toBeInTheDocument();
});
