import { useWriteCapabilities } from '../../hooks/useWriteCapabilities';
import PipelineKeys from './PipelineKeys';
import FirstRunPanel from './FirstRunPanel';
import ProjectReadme from './ProjectReadme';
import React from 'react';
import { Box, Paper, Tabs, Tab } from '@mui/material';
import type { AuthUser } from '@visin/frontend-core';

// New Tab Components
import BestRunCard from '../common/BestRunCard';
import ProjectOverviewTab, {
  type ProjectOverviewStats,
  type ProjectOverviewDashboardStats
} from './ProjectOverviewTab';
import ProjectTrainingsTab, { type TrainingSortColumn } from './ProjectTrainingsTab';
import ProjectTestsTab from './ProjectTestsTab';
import ProjectVisualizationsTab from './ProjectVisualizationsTab';
import ProjectBenchmarksTab from './ProjectBenchmarksTab';
import ProjectComparisonsTab from './ProjectComparisonsTab';
import ModelRegistry from '../models/ModelRegistry';
import EvaluationList from '../evaluations/EvaluationList';
import FindingsPanel from '../analysis/FindingsPanel';
import ProjectSettings from '../ProjectSettings';
import { discoverClasses, discoverConditions } from '../../taxonomy/discover';
import { Training, TestResultsPaginatedResponse, BenchmarksPaginatedResponse } from '../../types';
import { Project } from '../../types/Project';

/** A tab's name, with how much is behind it once there is any. */
const withCount = (label: string, count?: number) =>
  count ? (
    // One element: a Tab lays its children out as a column, which put the count under the name.
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {label}{' '}
      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
        {count}
      </Box>
    </Box>
  ) : (
    label
  );

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
      {value === index && <Box sx={{ px: { xs: 1.5, sm: 0 }, py: { xs: 2, sm: 3 } }}>{children}</Box>}
    </div>
  );
}

interface ProjectTabsProps {
  tabValue: number;
  onTabChange: (event: React.SyntheticEvent, newValue: number) => void;
  canManage: boolean;
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
  // Visualizations tab props
  // Benchmarks tab props
  benchmarksResponse: BenchmarksPaginatedResponse | undefined;
  isBenchmarksLoading: boolean;
  // Project for settings
  project: Project;
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({
  tabValue,
  onTabChange,
  canManage,
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
  benchmarksResponse,
  isBenchmarksLoading,
  project
}) => {
  // Conditions and classes this project's results already use, so the settings
  // editor can offer them rather than making someone retype what is in the data.
  const canWrite = useWriteCapabilities('project', [project._id]);
  const discoveredVocabulary = React.useMemo(() => {
    const results = testResultsResponse?.data?.testResults ?? [];
    return { conditions: discoverConditions(results), classes: discoverClasses(results) };
  }, [testResultsResponse]);

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: { xs: 0.5, sm: 2 } }}>
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
          <Tab label={withCount('Tests', dashboardStats?.testResultsCount)} />
          <Tab label={withCount('Visualizations', dashboardStats?.visualizationsCount)} />
          <Tab label={withCount('Benchmarks', dashboardStats?.benchmarksCount)} />
          <Tab label="Comparisons" />
          <Tab label="Analysis" />
          <Tab label="Models" />
          <Tab label="Evaluations" />
          {canManage && <Tab label="Settings" />}
        </Tabs>
      </Box>

      {/* Overview Tab */}
      <TabPanel value={tabValue} index={0}>
        {canWrite(project._id) && <FirstRunPanel project={project} />}
        {project.permissions.contribute && !canManage && <PipelineKeys projectId={project._id} />}
        <ProjectReadme project={project} />
        <BestRunCard projectId={project._id} />
        <ProjectOverviewTab stats={stats} isAuthenticated={isAuthenticated} user={user} />
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
        />
      </TabPanel>

      {/* Visualizations Tab */}
      <TabPanel value={tabValue} index={3}>
        <ProjectVisualizationsTab projectId={project._id} />
      </TabPanel>

      {/* Benchmarks Tab */}
      <TabPanel value={tabValue} index={4}>
        <ProjectBenchmarksTab
          benchmarksResponse={benchmarksResponse}
          isLoading={isBenchmarksLoading}
          isOwner={canWrite(project._id)}
        />
      </TabPanel>

      {/* Comparisons Tab */}
      <TabPanel value={tabValue} index={5}>
        <ProjectComparisonsTab projectId={project._id} />
      </TabPanel>

      {/* Analysis Tab — written conclusions, from the app or from an assistant */}
      <TabPanel value={tabValue} index={6}>
        <FindingsPanel projectId={project._id} isOwner={canWrite(project._id)} />
      </TabPanel>

      {/* Models Tab */}
      <TabPanel value={tabValue} index={7}>
        <Box sx={{ px: { xs: 0, sm: 3 } }}>
          <ModelRegistry projectId={project._id} title="Models" />
        </Box>
      </TabPanel>

      {/* Evaluations Tab */}
      <TabPanel value={tabValue} index={8}>
        <Box sx={{ px: { xs: 0, sm: 3 } }}>
          <EvaluationList projectId={project._id} title="Evaluations" />
        </Box>
      </TabPanel>

      {/* Settings Tab */}
      {canManage && (
        <TabPanel value={tabValue} index={9}>
          <Box sx={{ px: { xs: 0, sm: 3 } }}>
            <ProjectSettings project={project} discovered={discoveredVocabulary} />
          </Box>
        </TabPanel>
      )}
    </Paper>
  );
};

export default ProjectTabs;
