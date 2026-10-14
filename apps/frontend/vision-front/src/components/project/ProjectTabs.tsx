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
import ProjectEvaluationsTab from './ProjectEvaluationsTab';
import ProjectVisualizationsTab from './ProjectVisualizationsTab';
import ProjectBenchmarksTab from './ProjectBenchmarksTab';
import ProjectComparisonsTab from './ProjectComparisonsTab';
import ModelRegistry from '../models/ModelRegistry';
import FindingsPanel from '../analysis/FindingsPanel';
import ProjectSettings from '../ProjectSettings';
import { discoverClasses, discoverConditions } from '../../taxonomy/discover';
import { Training, RunEvaluationsResponse, BenchmarksPaginatedResponse } from '../../types';
import { Project } from '../../types/Project';
import type { ProjectTabKey } from './projectTabs';

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
  tab: ProjectTabKey;
  active: ProjectTabKey;
}

function TabPanel({ children, tab, active }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={active !== tab} id={`project-tabpanel-${tab}`} aria-labelledby={`project-tab-${tab}`}>
      {active === tab && <Box sx={{ px: { xs: 1.5, sm: 0 }, py: { xs: 2, sm: 3 } }}>{children}</Box>}
    </div>
  );
}

interface ProjectTabsProps {
  /** the open tab, by name */
  tab: ProjectTabKey;
  onTabChange: (tab: ProjectTabKey) => void;
  canManage: boolean;
  projectId: string;
  stats: ProjectOverviewStats | undefined;
  /** the totals are still on their way: the overview shows its strip as loading rather than as zeros */
  isStatsLoading?: boolean;
  /** asks to move the project to the trash, from its Settings */
  onMoveToTrash: () => void;
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
  // Evaluations tab props
  evaluationsResponse: RunEvaluationsResponse | undefined;
  isEvaluationsLoading: boolean;
  // Visualizations tab props
  // Benchmarks tab props
  benchmarksResponse: BenchmarksPaginatedResponse | undefined;
  isBenchmarksLoading: boolean;
  // Project for settings
  project: Project;
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({
  tab,
  onTabChange,
  canManage,
  projectId,
  stats,
  isStatsLoading,
  onMoveToTrash,
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
  evaluationsResponse,
  isEvaluationsLoading,
  benchmarksResponse,
  isBenchmarksLoading,
  project
}) => {
  // Conditions and classes this project's results already use, so the settings
  // editor can offer them rather than making someone retype what is in the data.
  const canWrite = useWriteCapabilities('project', [project._id]);
  const discoveredVocabulary = React.useMemo(() => {
    const results = evaluationsResponse?.data?.evaluations ?? [];
    return { conditions: discoverConditions(results), classes: discoverClasses(results) };
  }, [evaluationsResponse]);

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: { xs: 0.5, sm: 2 } }}>
        <Tabs
          value={tab}
          onChange={(_event, next: ProjectTabKey) => onTabChange(next)}
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
          <Tab value="overview" id="project-tab-overview" label="Overview" />
          <Tab value="trainings" id="project-tab-trainings" label="Trainings" />
          <Tab
            value="evaluations"
            id="project-tab-evaluations"
            label={withCount('Evaluations', dashboardStats?.testResultsCount)}
          />
          <Tab
            value="visualizations"
            id="project-tab-visualizations"
            label={withCount('Visualizations', dashboardStats?.visualizationsCount)}
          />
          <Tab
            value="benchmarks"
            id="project-tab-benchmarks"
            label={withCount('Benchmarks', dashboardStats?.benchmarksCount)}
          />
          <Tab value="comparisons" id="project-tab-comparisons" label="Comparisons" />
          <Tab value="analysis" id="project-tab-analysis" label="Analysis" />
          <Tab value="models" id="project-tab-models" label="Models" />
          {canManage && <Tab value="settings" id="project-tab-settings" label="Settings" />}
        </Tabs>
      </Box>

      {/* Overview Tab */}
      <TabPanel tab="overview" active={tab}>
        {/* The landing page first: setup guidance leads only while there is no real run, and hides itself after. */}
        {canWrite(project._id) && <FirstRunPanel project={project} />}
        <ProjectReadme project={project} />
        <BestRunCard projectId={project._id} />
        <ProjectOverviewTab stats={stats} isLoading={isStatsLoading} isAuthenticated={isAuthenticated} user={user} />
        {project.permissions.contribute && !canManage && <PipelineKeys projectId={project._id} />}
      </TabPanel>

      {/* Trainings Tab */}
      <TabPanel tab="trainings" active={tab}>
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

      {/* Evaluations Tab: a run's tests and checkpoints scored on a suite are one record */}
      <TabPanel tab="evaluations" active={tab}>
        <ProjectEvaluationsTab
          projectId={projectId}
          evaluationsResponse={evaluationsResponse}
          isLoading={isEvaluationsLoading}
        />
      </TabPanel>

      {/* Visualizations Tab */}
      <TabPanel tab="visualizations" active={tab}>
        <ProjectVisualizationsTab projectId={project._id} />
      </TabPanel>

      {/* Benchmarks Tab */}
      <TabPanel tab="benchmarks" active={tab}>
        <ProjectBenchmarksTab
          benchmarksResponse={benchmarksResponse}
          isLoading={isBenchmarksLoading}
          isOwner={canWrite(project._id)}
        />
      </TabPanel>

      {/* Comparisons Tab */}
      <TabPanel tab="comparisons" active={tab}>
        <ProjectComparisonsTab projectId={project._id} />
      </TabPanel>

      {/* Analysis Tab — written conclusions, from the app or from an assistant */}
      <TabPanel tab="analysis" active={tab}>
        <FindingsPanel projectId={project._id} isOwner={canWrite(project._id)} />
      </TabPanel>

      {/* Models Tab */}
      <TabPanel tab="models" active={tab}>
        <Box sx={{ px: { xs: 0, sm: 3 } }}>
          <ModelRegistry projectId={project._id} title="Models" />
        </Box>
      </TabPanel>

      {/* Settings Tab */}
      {canManage && (
        <TabPanel tab="settings" active={tab}>
          <Box sx={{ px: { xs: 0, sm: 3 } }}>
            <ProjectSettings project={project} discovered={discoveredVocabulary} onMoveToTrash={onMoveToTrash} />
          </Box>
        </TabPanel>
      )}
    </Paper>
  );
};

export default ProjectTabs;
