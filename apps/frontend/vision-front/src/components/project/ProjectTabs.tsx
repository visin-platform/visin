import React from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab
} from '@mui/material';
import type { AuthUser } from '@visin/frontend-core';

// New Tab Components
import ProjectOverviewTab, { type ProjectOverviewStats, type ProjectOverviewDashboardStats } from './ProjectOverviewTab';
import ProjectTrainingsTab, { type TrainingSortColumn } from './ProjectTrainingsTab';
import ProjectTestsTab from './ProjectTestsTab';
import ProjectVisualizationsTab, { type VisualizationsGroupedResult } from './ProjectVisualizationsTab';
import ProjectBenchmarksTab from './ProjectBenchmarksTab';
import ProjectComparisonsTab from './ProjectComparisonsTab';
import FindingsPanel from '../analysis/FindingsPanel';
import ProjectSettings from '../ProjectSettings';
import { discoverClasses, discoverConditions } from '../../taxonomy/discover';
import { Training, TestResultsPaginatedResponse, BenchmarksPaginatedResponse } from '../../types';
import { Project } from '../../types/Project';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`project-tabpanel-${index}`}
      aria-labelledby={`project-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

interface ProjectTabsProps {
  tabValue: number;
  onTabChange: (event: React.SyntheticEvent, newValue: number) => void;
  isOwner: boolean;
  projectId: string;
  stats: ProjectOverviewStats | undefined;
  dashboardStats: ProjectOverviewDashboardStats | undefined;
  isAuthenticated: boolean;
  user: AuthUser | null;
  // Trainings tab props
  trainings: Training[];
  isFullTrainingsLoading: boolean;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  sortBy: TrainingSortColumn;
  sortOrder: 'asc' | 'desc';
  onSort: (column: TrainingSortColumn) => void;
  // Tests tab props
  testResultsResponse: TestResultsPaginatedResponse | undefined;
  isTestResultsLoading: boolean;
  testsPage: number;
  testsRowsPerPage: number;
  onTestsPageChange: (event: unknown, newPage: number) => void;
  onTestsRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Visualizations tab props
  visualizationsResponse: VisualizationsGroupedResult | undefined;
  isVisualizationsLoading: boolean;
  // Benchmarks tab props
  benchmarksResponse: BenchmarksPaginatedResponse | undefined;
  isBenchmarksLoading: boolean;
  benchmarksPage: number;
  benchmarksRowsPerPage: number;
  onBenchmarksPageChange: (event: unknown, newPage: number) => void;
  onBenchmarksRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Project for settings
  project: Project;
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({
  tabValue,
  onTabChange,
  isOwner,
  projectId,
  stats,
  dashboardStats,
  isAuthenticated,
  user,
  trainings,
  isFullTrainingsLoading,
  page,
  rowsPerPage,
  total,
  onPageChange,
  onRowsPerPageChange,
  sortBy,
  sortOrder,
  onSort,
  testResultsResponse,
  isTestResultsLoading,
  testsPage,
  testsRowsPerPage,
  onTestsPageChange,
  onTestsRowsPerPageChange,
  visualizationsResponse,
  isVisualizationsLoading,
  benchmarksResponse,
  isBenchmarksLoading,
  benchmarksPage,
  benchmarksRowsPerPage,
  onBenchmarksPageChange,
  onBenchmarksRowsPerPageChange,
  project
}) => {
  // Conditions and classes this project's results already use, so the settings
  // editor can offer them rather than making someone retype what is in the data.
  const discoveredVocabulary = React.useMemo(() => {
    const results = testResultsResponse?.data?.testResults ?? [];
    return { conditions: discoverConditions(results), classes: discoverClasses(results) };
  }, [testResultsResponse]);

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs
          value={tabValue}
          onChange={onTabChange}
          aria-label="project tabs"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 48,
              px: { xs: 2, sm: 3 },
              minWidth: { xs: 'auto', sm: 90 },
              flexShrink: 0
            },
            '& .MuiTabs-scrollButtons': {
              display: { xs: 'flex', sm: 'auto' }
            },
            '& .MuiTabs-scroller': {
              overflow: 'auto !important',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }
          }}
        >
          <Tab label="Overview" />
          <Tab label="Trainings" />
          <Tab label="Tests" />
          <Tab label="Visualizations" />
          <Tab label="Benchmarks" />
          <Tab label="Comparisons" />
          <Tab label="Analysis" />
          {isOwner && <Tab label="Settings" />}
        </Tabs>
      </Box>

      {/* Overview Tab */}
      <TabPanel value={tabValue} index={0}>
        <ProjectOverviewTab
          stats={stats}
          dashboardStats={dashboardStats}
          isAuthenticated={isAuthenticated}
          user={user}
        />
      </TabPanel>

      {/* Trainings Tab */}
      <TabPanel value={tabValue} index={1}>
        <ProjectTrainingsTab
          projectId={projectId}
          trainings={trainings}
          isLoading={isFullTrainingsLoading}
          page={page}
          rowsPerPage={rowsPerPage}
          total={total}
          onPageChange={onPageChange}
          onRowsPerPageChange={onRowsPerPageChange}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          isAuthenticated={isAuthenticated}
        />
      </TabPanel>

      {/* Tests Tab */}
      <TabPanel value={tabValue} index={2}>
        <ProjectTestsTab
          projectId={projectId}
          testResultsResponse={testResultsResponse}
          isLoading={isTestResultsLoading}
          page={testsPage}
          rowsPerPage={testsRowsPerPage}
          onPageChange={onTestsPageChange}
          onRowsPerPageChange={onTestsRowsPerPageChange}
        />
      </TabPanel>

      {/* Visualizations Tab */}
      <TabPanel value={tabValue} index={3}>
        <ProjectVisualizationsTab
          projectId={projectId}
          visualizationsResponse={visualizationsResponse}
          isLoading={isVisualizationsLoading}
        />
      </TabPanel>

      {/* Benchmarks Tab */}
      <TabPanel value={tabValue} index={4}>
        <ProjectBenchmarksTab
          benchmarksResponse={benchmarksResponse}
          isLoading={isBenchmarksLoading}
          page={benchmarksPage}
          rowsPerPage={benchmarksRowsPerPage}
          onPageChange={onBenchmarksPageChange}
          onRowsPerPageChange={onBenchmarksRowsPerPageChange}
          isOwner={isOwner}
        />
      </TabPanel>

      {/* Comparisons Tab */}
      <TabPanel value={tabValue} index={5}>
        <ProjectComparisonsTab projectId={project._id} />
      </TabPanel>

      {/* Analysis Tab — written conclusions, from the app or from an assistant */}
      <TabPanel value={tabValue} index={6}>
        <FindingsPanel projectId={project._id} isOwner={isOwner} />
      </TabPanel>

      {/* Settings Tab */}
      {isOwner && (
        <TabPanel value={tabValue} index={7}>
          <Box sx={{ px: 3 }}>
            <ProjectSettings project={project} discovered={discoveredVocabulary} />
          </Box>
        </TabPanel>
      )}
    </Paper>
  );
};

export default ProjectTabs;