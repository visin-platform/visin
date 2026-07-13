import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectTabs from './ProjectTabs';

vi.mock('./ProjectOverviewTab', () => ({ default: () => <div>overview-tab</div> }));
vi.mock('./ProjectTrainingsTab', () => ({ default: () => <div>trainings-tab</div> }));
vi.mock('./ProjectTestsTab', () => ({ default: () => <div>tests-tab</div> }));
vi.mock('./ProjectVisualizationsTab', () => ({ default: () => <div>visualizations-tab</div> }));
vi.mock('./ProjectBenchmarksTab', () => ({ default: () => <div>benchmarks-tab</div> }));
vi.mock('./ProjectComparisonsTab', () => ({ default: () => <div>comparisons-tab</div> }));
vi.mock('../ProjectSettings', () => ({ default: () => <div>settings-tab</div> }));

const baseProps = {
  tabValue: 0,
  onTabChange: vi.fn(),
  isOwner: false,
  projectId: 'p1',
  stats: {},
  dashboardStats: {},
  isAuthenticated: true,
  user: {},
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
  testResultsResponse: {},
  isTestResultsLoading: false,
  testsPage: 0,
  testsRowsPerPage: 25,
  onTestsPageChange: vi.fn(),
  onTestsRowsPerPageChange: vi.fn(),
  visualizationsResponse: {},
  isVisualizationsLoading: false,
  benchmarksResponse: {},
  isBenchmarksLoading: false,
  benchmarksPage: 0,
  benchmarksRowsPerPage: 25,
  onBenchmarksPageChange: vi.fn(),
  onBenchmarksRowsPerPageChange: vi.fn(),
  project: { _id: 'p1' },
};

describe('ProjectTabs', () => {
  it('renders the overview tab content by default', () => {
    render(<ProjectTabs {...baseProps} tabValue={0} />);

    expect(screen.getByText('overview-tab')).toBeInTheDocument();
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
    render(<ProjectTabs {...baseProps} isOwner={false} />);

    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('shows the Settings tab and its content when the caller is the owner', () => {
    render(<ProjectTabs {...baseProps} isOwner tabValue={6} />);

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
