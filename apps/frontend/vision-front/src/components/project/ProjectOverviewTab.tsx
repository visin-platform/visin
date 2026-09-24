import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  SvgIconProps
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  AttachMoney as CostIcon,
  AccessTime as TimeIcon,
  Speed as SpeedIcon,
  Assessment as AssessmentIcon,
  Image as ImageIcon,
  BarChart as BarChartIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { tint, type AuthUser } from '@visin/frontend-core';
import { TrainingStats } from '../../services/trainingService';
import { ProjectDashboardStats } from '../../services/projectService';
import { useFormatCost } from '../../costing/useCosting';

export type ProjectOverviewStats = Pick<TrainingStats, 'totalTrainings' | 'totalTime' | 'totalCost' | 'avgEpochTime'> & { currency?: string };
export type ProjectOverviewDashboardStats = Pick<ProjectDashboardStats, 'testResultsCount' | 'visualizationsCount' | 'benchmarksCount'>;

interface ProjectOverviewTabProps {
  stats: ProjectOverviewStats | undefined;
  dashboardStats: ProjectOverviewDashboardStats | undefined;
  isAuthenticated: boolean;
  user: AuthUser | null;
}

interface StatTile {
  label: string;
  value: string | number;
  icon: React.ReactElement<SvgIconProps>;
  /** Palette family for the icon chip: `.main` on a tint of itself. */
  color: string;
  /** Column width from the `sm` breakpoint up; phones always show two per row. */
  width: number;
}

const StatCard: React.FC<{ tile: StatTile }> = ({ tile }) => (
  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
    <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: { xs: 0.75, sm: 2 } }}>
        <Box
          sx={{
            display: 'flex',
            p: { xs: 0.5, sm: 1 },
            borderRadius: 1,
            bgcolor: tint(`var(--mui-palette-${tile.color}-main)`, 0.12),
            color: `${tile.color}.main`,
            mr: { xs: 1, sm: 2 },
            '& .MuiSvgIcon-root': { fontSize: { xs: '1rem', sm: '1.5rem' } }
          }}
        >
          {tile.icon}
        </Box>
        <Typography
          variant="subtitle2"
          sx={{
            color: 'text.secondary',
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            lineHeight: 1.3
          }}>
          {tile.label}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontWeight: 'bold',
          // A count and a "2h 3m" have to fit the same narrow tile.
          fontSize: { xs: '1.25rem', sm: '2.125rem' },
          lineHeight: 1.2
        }}>
        {tile.value}
      </Typography>
    </CardContent>
  </Card>
);

const ProjectOverviewTab: React.FC<ProjectOverviewTabProps> = ({
  stats,
  dashboardStats,
  isAuthenticated,
  user
}) => {
  const navigate = useNavigate();
  const formatCost = useFormatCost();

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const tiles: StatTile[] = [
    { label: 'Total Trainings', value: stats?.totalTrainings || 0, icon: <TimelineIcon />, color: 'primary', width: 3 },
    { label: 'Total Training Time', value: formatTime(stats?.totalTime || 0), icon: <TimeIcon />, color: 'info', width: 3 },
    { label: 'Total Cost', value: formatCost(stats?.totalCost || 0, stats?.currency), icon: <CostIcon />, color: 'warning', width: 3 },
    { label: 'Avg. Epoch Time', value: stats?.avgEpochTime ? formatTime(stats.avgEpochTime) : '-', icon: <SpeedIcon />, color: 'success', width: 3 },
    { label: 'Test Results', value: dashboardStats?.testResultsCount || 0, icon: <AssessmentIcon />, color: 'secondary', width: 4 },
    { label: 'Visualizations', value: dashboardStats?.visualizationsCount || 0, icon: <ImageIcon />, color: 'error', width: 4 },
    { label: 'Benchmarks', value: dashboardStats?.benchmarksCount || 0, icon: <BarChartIcon />, color: 'orange', width: 4 }
  ];

  return (
    <>
      {/* Stats Cards */}
      <Grid container spacing={{ xs: 1.5, sm: 3 }} sx={{ mb: { xs: 2, sm: 4 } }}>
        {tiles.map((tile) => (
          <Grid key={tile.label} size={{ xs: 6, sm: 6, md: tile.width }}>
            <StatCard tile={tile} />
          </Grid>
        ))}
      </Grid>
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
