import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
  getJobStats: vi.fn(),
  getMyGroups: vi.fn(),
  transitionJob: vi.fn(),
  setJobVisibility: vi.fn(),
  downloadExport: vi.fn(),
  deleteJob: vi.fn(),
}));

// Signed in unless a test says otherwise — anonymous is the exception here.
const authState = { isAuthenticated: true, isLoading: false, user: { email: 'w@x.com' }, login: vi.fn(), logout: vi.fn() };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { deleteJob, downloadExport, getJob, getJobStats, getMyGroups, transitionJob, setJobVisibility } from '../services/jobService';
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
  taskType: 'mask_toggle',
  redundancy: 2,
  question: { prompt: 'Mark all incorrect masks' },
  tasksCount: 10,
  progress: { tasks: 10, completed: 4, answers: 12, myAnswers: 6 },
  ...overrides,
});

const stats = {
  tasks: 10,
  completed: 4,
  answers: 12,
  perUser: [{ userEmail: 'a@x.com', userName: 'Ann', answered: 7 }],
  perStratum: [
    { stratum: 'vehicle', tasks: 6, completed: 3 },
    { stratum: 'sign', tasks: 4, completed: 1 },
  ],
  agreement: 0.875,
};

const renderPage = () => renderWithProviders(<JobDetailPage />, { route: '/jobs/j1', path: '/jobs/:id' });

beforeEach(() => {
  vi.clearAllMocks();
  canManage = false;
  mockedGetJob.mockResolvedValue(job());
  mockedStats.mockResolvedValue(stats);
  mockedGroups.mockResolvedValue([]);
});


/** Admin chores sit behind the job's ⋮ menu: open it and choose one. */
const chooseAction = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: /More actions for/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name }));
};

describe('JobDetailPage', () => {
  it('shows progress, stats, per-user and per-stratum tables', async () => {
    renderPage();

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.getByText(/4\/10 tasks complete/)).toBeInTheDocument();
    expect(await screen.findByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('vehicle')).toBeInTheDocument();
    expect(screen.getByText(/87\.5%/)).toBeInTheDocument(); // agreement (K=2)
  });

  it('hides admin controls for plain workers but shows the labeling link', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/j1/work');
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    // Admin chores live behind the ⋮ menu, which a non-admin does not get.
    expect(screen.queryByRole('button', { name: /More actions for/ })).not.toBeInTheDocument();
  });

  it('lets an admin pause and export', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedTransition.mockResolvedValue(job({ status: 'paused' }));
    mockedExport.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'pause'));

    await chooseAction('Export CSV');
    expect(mockedExport).toHaveBeenCalledWith('j1', 'csv');

    await chooseAction('Export manifest');
    expect(mockedExport).toHaveBeenCalledWith('j1', 'manifest');
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

  it('exports JSONL and surfaces export failures', async () => {
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedExport.mockRejectedValue(new Error('Export failed (500)'));
    renderPage();

    await chooseAction('Export JSONL');

    expect(mockedExport).toHaveBeenCalledWith('j1', 'jsonl');
    expect(await screen.findByText('Export failed (500)')).toBeInTheDocument();
  });
  it('hard-deletes the job once confirmed and returns to the list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    mockedDelete.mockResolvedValue({ tasks: 4135, answers: 7 });
    renderPage();

    await chooseAction('Delete');

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('j1'));
    // The 4 collected answers are named in the prompt: they are the labeling
    // effort, and archiving used to be the only option that kept them.
    expect(confirmSpy.mock.calls[0][0]).toContain('4 collected answer(s)');
    confirmSpy.mockRestore();
  });

  it('does not delete when the confirmation is declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    canManage = true;
    mockedGetJob.mockResolvedValue(job());
    renderPage();

    await chooseAction('Delete');

    expect(mockedDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
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
