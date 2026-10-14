vi.mock('../../hooks/useWriteCapabilities', () => ({ useWriteCapabilities: () => () => true }));
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectTabs from './ProjectTabs';

vi.mock('./ProjectOverviewTab', () => ({ default: () => <div>overview-tab</div> }));
vi.mock('./ProjectReadme', () => ({ default: ({ project }: { project: { _id: string } }) => <div>readme:{project._id}</div> }));
vi.mock('./ProjectTrainingsTab', () => ({ default: () => <div>trainings-tab</div> }));
vi.mock('./ProjectEvaluationsTab', () => ({ default: () => <div>evaluations-tab</div> }));
vi.mock('./ProjectVisualizationsTab', () => ({ default: () => <div>visualizations-tab</div> }));
vi.mock('./ProjectBenchmarksTab', () => ({ default: () => <div>benchmarks-tab</div> }));
vi.mock('./ProjectComparisonsTab', () => ({ default: () => <div>comparisons-tab</div> }));
vi.mock('../analysis/FindingsPanel', () => ({ default: () => <div>analysis-tab</div> }));
vi.mock('../models/ModelRegistry', () => ({ default: ({ projectId }: { projectId: string }) => <div>models-tab:{projectId}</div> }));
vi.mock('../ProjectSettings', () => ({ default: () => <div>settings-tab</div> }));
vi.mock('../common/BestRunCard', () => ({ default: ({ projectId }: { projectId: string }) => <div>best-run:{projectId}</div> }));
vi.mock('./FirstRunPanel', () => ({ default: () => <div>first-run-panel</div> }));

const baseProps = {
  tab: 'overview' as const,
  onTabChange: vi.fn(),
  onMoveToTrash: vi.fn(),
  canManage: false,
  projectId: 'p1',
  stats: { totalTrainings: 0, totalTime: 0, totalCost: 0, avgEpochTime: 0 },
  dashboardStats: { testResultsCount: 0, visualizationsCount: 0, benchmarksCount: 0 },
  isAuthenticated: true,
  user: { id: 'u1', email: 'u1@test.dev', name: 'User One' },
  trainings: [],
  isFullTrainingsLoading: false,
  page: 0,
  rowsPerPage: 25,
  total: 0,
  onPageChange: vi.fn(),
  onRowsPerPageChange: vi.fn(),
  sortBy: 'updatedAt' as const,
  sortOrder: 'desc' as const,
  onSort: vi.fn(),
  evaluationsResponse: {
    success: true,
    data: { evaluations: [], pagination: { page: 0, limit: 25, total: 0, pages: 0 } }
  },
  isEvaluationsLoading: false,
  benchmarksResponse: {
    success: true,
    data: { benchmarks: [], pagination: { page: 0, limit: 25, total: 0, pages: 0 } }
  },
  isBenchmarksLoading: false,
  project: {
    _id: 'p1',
    name: 'Project 1',
    visibility: 'private' as const,
    owner: { kind: 'user' as const, id: 'u1' },
    createdBy: 'u1',
    permissions: { read: true, contribute: true, manage: true, own: true },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
};

describe('ProjectTabs', () => {
  it('renders the overview tab content by default', () => {
    render(<ProjectTabs {...baseProps} tab="overview" />);

    expect(screen.getByText('overview-tab')).toBeInTheDocument();
    expect(screen.getByText(/^best-run:/)).toBeInTheDocument();
  });

  it('puts the project\'s readme on its overview, ahead of the numbers, and not on the other tabs', () => {
    const { rerender } = render(<ProjectTabs {...baseProps} tab="overview" />);

    const readme = screen.getByText(/^readme:/);
    expect(readme.compareDocumentPosition(screen.getByText('overview-tab')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<ProjectTabs {...baseProps} tab="trainings" />);
    expect(screen.queryByText(/^readme:/)).not.toBeInTheDocument();
  });

  it('counts what is behind the Evaluations, Visualizations and Benchmarks tabs, once there is any', () => {
    render(
      <ProjectTabs
        {...baseProps}
        dashboardStats={{ testResultsCount: 3, visualizationsCount: 0, benchmarksCount: 12 }}
      />
    );

    expect(screen.getByRole('tab', { name: 'Evaluations 3' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visualizations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Benchmarks 12' })).toBeInTheDocument();
  });

  it('renders the tab content matching each name', () => {
    const { rerender } = render(<ProjectTabs {...baseProps} tab="trainings" />);
    expect(screen.getByText('trainings-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tab="evaluations" />);
    expect(screen.getByText('evaluations-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tab="visualizations" />);
    expect(screen.getByText('visualizations-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tab="benchmarks" />);
    expect(screen.getByText('benchmarks-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tab="comparisons" />);
    expect(screen.getByText('comparisons-tab')).toBeInTheDocument();
  });

  it('puts setup guidance after the readme and the best run, which are the landing page', () => {
    render(<ProjectTabs {...baseProps} />);

    const readme = screen.getByText(/^readme:/);
    const guide = screen.getByText('first-run-panel');
    // The first-run guide hides itself once there is a run, so what is left leads with the project's own words.
    expect(guide.compareDocumentPosition(readme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(readme.compareDocumentPosition(screen.getByText(/^best-run:/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the Settings tab when the caller is not the owner', () => {
    render(<ProjectTabs {...baseProps} canManage={false} />);

    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows the Analysis tab, which every viewer gets', () => {
    render(<ProjectTabs {...baseProps} tab="analysis" />);

    expect(screen.getByRole('tab', { name: 'Analysis' })).toBeInTheDocument();
    expect(screen.getByText('analysis-tab')).toBeInTheDocument();
  });

  it('shows the Models tab for the project, to every viewer', () => {
    render(<ProjectTabs {...baseProps} tab="models" />);

    expect(screen.getByRole('tab', { name: 'Models' })).toBeInTheDocument();
    expect(screen.getByText('models-tab:p1')).toBeInTheDocument();
  });

  it('has one Evaluations tab: a run\'s tests and a checkpoint scored on a suite are the same records', () => {
    render(<ProjectTabs {...baseProps} tab="evaluations" />);

    expect(screen.getAllByRole('tab', { name: /^Evaluations/ })).toHaveLength(1);
    expect(screen.queryByRole('tab', { name: /^Tests/ })).not.toBeInTheDocument();
    expect(screen.getByText('evaluations-tab')).toBeInTheDocument();
  });

  it('shows the Settings tab and its content when the caller is the owner', () => {
    render(<ProjectTabs {...baseProps} canManage tab="settings" />);

    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('settings-tab')).toBeInTheDocument();
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<ProjectTabs {...baseProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Trainings' }));

    expect(onTabChange).toHaveBeenCalledWith('trainings');
  });
});

vi.mock('./PipelineKeys', () => ({ default: () => <div>pipeline-keys</div> }));
