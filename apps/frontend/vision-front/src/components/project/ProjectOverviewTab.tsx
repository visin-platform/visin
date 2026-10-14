import React from 'react';
import { Box, Button, Paper, Skeleton, Typography } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '@visin/frontend-core';
import { TrainingStats } from '../../services/trainingService';
import { ProjectDashboardStats } from '../../services/projectService';
import { useCosting, useFormatCost } from '../../costing/useCosting';

export type ProjectOverviewStats = Pick<TrainingStats, 'totalTrainings' | 'totalTime' | 'totalCost' | 'avgEpochTime'> & { currency?: string };
export type ProjectOverviewDashboardStats = Pick<ProjectDashboardStats, 'testResultsCount' | 'visualizationsCount' | 'benchmarksCount'>;

interface ProjectOverviewTabProps {
  stats: ProjectOverviewStats | undefined;
  /** the totals are still being read: show the strip as loading, not as zeros */
  isLoading?: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
}

interface Figure {
  label: string;
  value: string | number;
}

/**
 * What the project has used, in one strip. The counts of tests, visualizations
 * and benchmarks live on their own tabs, and what the best run reached is
 * the card above this.
 */
const ProjectOverviewTab: React.FC<ProjectOverviewTabProps> = ({ stats, isLoading, isAuthenticated, user }) => {
  const navigate = useNavigate();
  const costing = useCosting();
  const formatCost = useFormatCost();

  // Hours and minutes, without a leading "0h": an epoch of two minutes reads "2m", not "0h 2m".
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${Math.round(seconds)}s`;
  };

  const figures: Figure[] = [
    { label: 'Trainings', value: stats?.totalTrainings || 0 },
    { label: 'Training time', value: formatTime(stats?.totalTime || 0) },
    { label: 'Avg. epoch time', value: stats?.avgEpochTime ? formatTime(stats.avgEpochTime) : '-' },
    // A project with no rates has no cost to show, rather than a cost of nothing.
    ...(costing || stats?.currency
      ? [{ label: 'Cost', value: formatCost(stats?.totalCost || 0, stats?.currency) }]
      : [])
  ];

  return (
    <>
      <Paper
        component="dl"
        elevation={0}
        aria-label="Project totals"
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          m: 0,
          mb: { xs: 2, sm: 3 },
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${figures.length}, minmax(0, 1fr))` },
          gap: 0
        }}
      >
        {figures.map((figure, index) => (
          <Box
            key={figure.label}
            sx={{
              px: 2,
              py: 1.5,
              borderLeft: { sm: index === 0 ? 'none' : '1px solid' },
              borderColor: 'divider'
            }}
          >
            <Typography component="dt" variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {figure.label}
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontWeight: 700, fontSize: { xs: '1.1rem', sm: '1.35rem' }, lineHeight: 1.3 }}>
              {isLoading ? <Skeleton width="60%" aria-label="Loading" /> : figure.value}
            </Typography>
          </Box>
        ))}
      </Paper>
      {!isAuthenticated && (
        <Box sx={{ px: { xs: 0, sm: 3 }, py: { xs: 2, sm: 4 } }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Project Overview
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              Monitor your machine learning project's progress and results.
            </Typography>
            {user && (
              <Button 
                variant="contained" 
                startIcon={<AddIcon />}
                onClick={() => navigate('/trainings')}
                size="large"
              >
                Start New Training
              </Button>
            )}
          </Box>
        </Box>
      )}
    </>
  );
};

export default ProjectOverviewTab;
