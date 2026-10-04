vi.mock('../../hooks/useWriteCapabilities', () => ({ useWriteCapabilities: () => () => true }));
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectTabs from './ProjectTabs';

vi.mock('./ProjectOverviewTab', () => ({ default: () => <div>overview-tab</div> }));
vi.mock('./ProjectReadme', () => ({ default: ({ project }: { project: { _id: string } }) => <div>readme:{project._id}</div> }));
vi.mock('./ProjectTrainingsTab', () => ({ default: () => <div>trainings-tab</div> }));
vi.mock('./ProjectTestsTab', () => ({ default: () => <div>tests-tab</div> }));
vi.mock('./ProjectVisualizationsTab', () => ({ default: () => <div>visualizations-tab</div> }));
vi.mock('./ProjectBenchmarksTab', () => ({ default: () => <div>benchmarks-tab</div> }));
vi.mock('./ProjectComparisonsTab', () => ({ default: () => <div>comparisons-tab</div> }));
vi.mock('../analysis/FindingsPanel', () => ({ default: () => <div>analysis-tab</div> }));
vi.mock('../models/ModelRegistry', () => ({ default: ({ projectId }: { projectId: string }) => <div>models-tab:{projectId}</div> }));
vi.mock('../evaluations/EvaluationList', () => ({ default: ({ projectId }: { projectId: string }) => <div>evaluations-tab:{projectId}</div> }));
vi.mock('../ProjectSettings', () => ({ default: () => <div>settings-tab</div> }));
vi.mock('../common/BestRunCard', () => ({ default: ({ projectId }: { projectId: string }) => <div>best-run:{projectId}</div> }));
vi.mock('./FirstRunPanel', () => ({ default: () => <div>first-run-panel</div> }));

const baseProps = {
  tabValue: 0,
  onTabChange: vi.fn(),
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
  testResultsResponse: {
    success: true,
    data: { testResults: [], pagination: { page: 0, limit: 25, total: 0, pages: 0 } }
  },
  isTestResultsLoading: false,
  testsPage: 0,
  testsRowsPerPage: 25,
  onTestsPageChange: vi.fn(),
  onTestsRowsPerPageChange: vi.fn(),
  visualizationsResponse: { success: true, data: { trainings: [] } },
  isVisualizationsLoading: false,
  benchmarksResponse: {
    success: true,
    data: { benchmarks: [], pagination: { page: 0, limit: 25, total: 0, pages: 0 } }
  },
  isBenchmarksLoading: false,
  benchmarksPage: 0,
  benchmarksRowsPerPage: 25,
  onBenchmarksPageChange: vi.fn(),
  onBenchmarksRowsPerPageChange: vi.fn(),
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
    render(<ProjectTabs {...baseProps} tabValue={0} />);

    expect(screen.getByText('overview-tab')).toBeInTheDocument();
    expect(screen.getByText(/^best-run:/)).toBeInTheDocument();
  });

  it('puts the project\'s readme on its overview, ahead of the numbers, and not on the other tabs', () => {
    const { rerender } = render(<ProjectTabs {...baseProps} tabValue={0} />);

    const readme = screen.getByText(/^readme:/);
    expect(readme.compareDocumentPosition(screen.getByText('overview-tab')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<ProjectTabs {...baseProps} tabValue={1} />);
    expect(screen.queryByText(/^readme:/)).not.toBeInTheDocument();
  });

  it('renders the tab content matching each index', () => {
    const { rerender } = render(<ProjectTabs {...baseProps} tabValue={1} />);
    expect(screen.getByText('trainings-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tabValue={2} />);
    expect(screen.getByText('tests-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tabValue={3} />);
    expect(screen.getByText('visualizations-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tabValue={4} />);
    expect(screen.getByText('benchmarks-tab')).toBeInTheDocument();

    rerender(<ProjectTabs {...baseProps} tabValue={5} />);
    expect(screen.getByText('comparisons-tab')).toBeInTheDocument();
  });

  it('hides the Settings tab when the caller is not the owner', () => {
    render(<ProjectTabs {...baseProps} canManage={false} />);

    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows the Analysis tab, which every viewer gets', () => {
    render(<ProjectTabs {...baseProps} tabValue={6} />);

    expect(screen.getByRole('tab', { name: 'Analysis' })).toBeInTheDocument();
    expect(screen.getByText('analysis-tab')).toBeInTheDocument();
  });

  it('shows the Models tab for the project, to every viewer', () => {
    render(<ProjectTabs {...baseProps} tabValue={7} />);

    expect(screen.getByRole('tab', { name: 'Models' })).toBeInTheDocument();
    expect(screen.getByText('models-tab:p1')).toBeInTheDocument();
  });

  it('shows the Evaluations tab for the project, to every viewer', () => {
    render(<ProjectTabs {...baseProps} tabValue={8} />);

    expect(screen.getByRole('tab', { name: 'Evaluations' })).toBeInTheDocument();
    expect(screen.getByText('evaluations-tab:p1')).toBeInTheDocument();
  });

  it('shows the Settings tab and its content when the caller is the owner', () => {
    // Settings sits after Evaluations, so it is index 9.
    render(<ProjectTabs {...baseProps} canManage tabValue={9} />);

    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('settings-tab')).toBeInTheDocument();
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<ProjectTabs {...baseProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Trainings' }));

    expect(onTabChange).toHaveBeenCalledWith(expect.anything(), 1);
  });
});

vi.mock('./PipelineKeys', () => ({ default: () => <div>pipeline-keys</div> }));
