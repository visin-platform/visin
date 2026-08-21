import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useProjectDashboardMock = vi.fn();
vi.mock('../../hooks/useProjectDashboard', () => ({
  useProjectDashboard: (...args: unknown[]) => useProjectDashboardMock(...args)
}));

const useAuthMock = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

const updateProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
vi.mock('../../services/projectService', () => ({
  projectService: {
    updateProject: (...args: unknown[]) => updateProjectMock(...args),
    deleteProject: (...args: unknown[]) => deleteProjectMock(...args)
  }
}));

vi.mock('../../components/project/ProjectHeader', () => ({
  default: (props: any) => (
    <div data-testid="project-header">
      <span>{props.project.name}</span>
      <span data-testid="is-owner">{String(props.isOwner)}</span>
      <button onClick={() => props.onEdit()}>open-edit</button>
      <button onClick={() => props.onDelete()}>open-delete</button>
    </div>
  )
}));

vi.mock('../../components/project/ProjectTabs', () => ({
  default: (props: any) => (
    <div data-testid="project-tabs">
      <span data-testid="tab-value">{props.tabValue}</span>
      <span data-testid="trainings-total">{props.total}</span>
      <button onClick={() => props.onTabChange({}, 1)}>go-to-trainings-tab</button>
    </div>
  )
}));

vi.mock('../../components/project/EditProjectDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="edit-project-dialog">
        <span data-testid="edit-updating">{String(props.isUpdating)}</span>
        <button onClick={() => props.onSubmit()}>submit-edit</button>
        <button onClick={() => props.onClose()}>close-edit</button>
      </div>
    ) : null
}));

vi.mock('../../components/project/DeleteProjectDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-project-dialog">
        <span data-testid="delete-deleting">{String(props.isDeleting)}</span>
        <button onClick={() => props.onConfirm()}>confirm-delete-project</button>
      </div>
    ) : null
}));

vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));

import ProjectDashboardPage from '../ProjectDashboardPage';

const baseHookReturn = (overrides: Record<string, unknown> = {}) => ({
  project: { _id: 'p1', name: 'My Project', description: 'desc', isPublic: true, ownerId: 'u1' },
  stats: {},
  dashboardStats: {},
  fullTrainings: { trainings: [], pagination: { total: 0 } },
  testResults: {},
  visualizations: {},
  benchmarks: {},
  isProjectLoading: false,
  isStatsLoading: false,
  isDashboardStatsLoading: false,
  isFullTrainingsLoading: false,
  isTestResultsLoading: false,
  isVisualizationsLoading: false,
  isBenchmarksLoading: false,
  projectError: null,
  page: 0,
  rowsPerPage: 25,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  testsPage: 0,
  testsRowsPerPage: 25,
  benchmarksPage: 0,
  benchmarksRowsPerPage: 25,
  handlePageChange: vi.fn(),
  handleRowsPerPageChange: vi.fn(),
  handleTestsPageChange: vi.fn(),
  handleTestsRowsPerPageChange: vi.fn(),
  handleBenchmarksPageChange: vi.fn(),
  handleBenchmarksRowsPerPageChange: vi.fn(),
  handleSort: vi.fn(),
  invalidateProjectQueries: vi.fn(),
  ...overrides
});

const renderPage = (path = '/projects/p1') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDashboardPage />} />
          <Route path="/projects" element={<div>projects list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return qc;
};

describe('ProjectDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, isAuthenticated: true });
    useProjectDashboardMock.mockReturnValue(baseHookReturn());
  });

  it('shows a spinner while the project is loading', () => {
    useProjectDashboardMock.mockReturnValue(baseHookReturn({ isProjectLoading: true }));
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId('project-header')).not.toBeInTheDocument();
  });

  it('shows an error message and a back link when the project fails to load', () => {
    useProjectDashboardMock.mockReturnValue(baseHookReturn({ projectError: new Error('nope'), project: undefined }));
    renderPage();
    expect(screen.getByText(/Failed to load project/i)).toBeInTheDocument();
    expect(screen.getByText('Back to Projects')).toBeInTheDocument();
  });

  it('renders the project header and tabs, marking the current user as owner', () => {
    renderPage();
    expect(screen.getByTestId('project-header')).toHaveTextContent('My Project');
    expect(screen.getByTestId('is-owner').textContent).toBe('true');
    expect(screen.getByTestId('project-tabs')).toBeInTheDocument();
  });

  it('marks the user as a non-owner when ids differ', () => {
    useAuthMock.mockReturnValue({ user: { id: 'someone-else' }, isAuthenticated: true });
    renderPage();
    expect(screen.getByTestId('is-owner').textContent).toBe('false');
  });

  it('opens the edit dialog from the header and submits an update', async () => {
    updateProjectMock.mockResolvedValue({});
    const hookReturn = baseHookReturn();
    useProjectDashboardMock.mockReturnValue(hookReturn);
    renderPage();

    fireEvent.click(screen.getByText('open-edit'));
    expect(screen.getByTestId('edit-project-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('submit-edit'));
    await waitFor(() => expect(updateProjectMock).toHaveBeenCalledWith('p1', {
      name: 'My Project',
      description: 'desc',
      isPublic: true
    }));
    await waitFor(() => expect(hookReturn.invalidateProjectQueries).toHaveBeenCalled());
  });

  it('opens the delete dialog from the header and confirms deletion, navigating away', async () => {
    deleteProjectMock.mockResolvedValue({});
    renderPage();

    fireEvent.click(screen.getByText('open-delete'));
    expect(screen.getByTestId('delete-project-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('confirm-delete-project'));
    await waitFor(() => expect(deleteProjectMock).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(screen.getByText('projects list')).toBeInTheDocument());
  });

  it('drops the cached project and marks the projects list stale after deleting', async () => {
    deleteProjectMock.mockResolvedValue({});
    const qc = renderPage();
    qc.setQueryData(['project', 'p1'], { data: { _id: 'p1' } });
    qc.setQueryData(['projects', 'u1', 'createdAt', 'desc'], { data: [{ _id: 'p1' }] });

    fireEvent.click(screen.getByText('open-delete'));
    fireEvent.click(screen.getByText('confirm-delete-project'));

    await waitFor(() => expect(qc.getQueryData(['project', 'p1'])).toBeUndefined());
    await waitFor(() =>
      expect(qc.getQueryState(['projects', 'u1', 'createdAt', 'desc'])?.isInvalidated).toBe(true)
    );
  });

  it('changes tabs and updates the tab value passed to ProjectTabs', () => {
    renderPage();
    expect(screen.getByTestId('tab-value').textContent).toBe('0');
    fireEvent.click(screen.getByText('go-to-trainings-tab'));
    expect(screen.getByTestId('tab-value').textContent).toBe('1');
  });

  it('passes the trainings pagination total through to ProjectTabs', () => {
    useProjectDashboardMock.mockReturnValue(
      baseHookReturn({ fullTrainings: { trainings: [{ _id: 't1' }], pagination: { total: 5 } } })
    );
    renderPage();
    expect(screen.getByTestId('trainings-total').textContent).toBe('5');
  });
});
