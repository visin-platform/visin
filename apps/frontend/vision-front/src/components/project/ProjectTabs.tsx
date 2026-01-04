import React from 'react';
import {
  Box,
  Paper,
  Tabs,
  Tab
} from '@mui/material';

// New Tab Components
import ProjectOverviewTab from './ProjectOverviewTab';
import ProjectTrainingsTab from './ProjectTrainingsTab';
import ProjectTestsTab from './ProjectTestsTab';
import ProjectVisualizationsTab from './ProjectVisualizationsTab';
import ProjectBenchmarksTab from './ProjectBenchmarksTab';
import ProjectComparisonsTab from './ProjectComparisonsTab';
import ProjectSettings from '../ProjectSettings';

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
  stats: any;
  dashboardStats: any;
  isAuthenticated: boolean;
  user: any;
  // Trainings tab props
  trainings: any[];
  isFullTrainingsLoading: boolean;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortOrder: 'asc' | 'desc';
  onSort: (column: any) => void;
  // Tests tab props
  testResultsResponse: any;
  isTestResultsLoading: boolean;
  testsPage: number;
  testsRowsPerPage: number;
  onTestsPageChange: (event: unknown, newPage: number) => void;
  onTestsRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Visualizations tab props
  visualizationsResponse: any;
  isVisualizationsLoading: boolean;
  // Benchmarks tab props
  benchmarksResponse: any;
  isBenchmarksLoading: boolean;
  benchmarksPage: number;
  benchmarksRowsPerPage: number;
  onBenchmarksPageChange: (event: unknown, newPage: number) => void;
  onBenchmarksRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // Project for settings
  project: any;
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
  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs value={tabValue} onChange={onTabChange} aria-label="project tabs">
          <Tab label="Overview" />
          <Tab label="Trainings" />
          <Tab label="Tests" />
          <Tab label="Visualizations" />
          <Tab label="Benchmarks" />
          <Tab label="Comparisons" />
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
        />
      </TabPanel>

      {/* Comparisons Tab */}
      <TabPanel value={tabValue} index={5}>
        <ProjectComparisonsTab projectId={projectId} />
      </TabPanel>

      {/* Settings Tab */}
      {isOwner && (
        <TabPanel value={tabValue} index={6}>
          <Box sx={{ px: 3 }}>
            <ProjectSettings project={project} />
          </Box>
        </TabPanel>
      )}
    </Paper>
  );
};

export default ProjectTabs;