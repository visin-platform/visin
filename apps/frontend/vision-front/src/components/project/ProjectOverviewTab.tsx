import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button
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
import type { AuthUser } from '@visin/frontend-core';
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



  return (
    <>
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'primary.light', color: 'primary.main', mr: 2 }}>
                  <TimelineIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Total Trainings
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {stats?.totalTrainings || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'info.light', color: 'info.main', mr: 2 }}>
                  <TimeIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Total Training Time
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {formatTime(stats?.totalTime || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'warning.light', color: 'warning.main', mr: 2 }}>
                  <CostIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Total Cost
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {formatCost(stats?.totalCost || 0, stats?.currency)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'success.light', color: 'success.main', mr: 2 }}>
                  <SpeedIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Avg. Epoch Time
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {stats?.avgEpochTime ? formatTime(stats.avgEpochTime) : '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'secondary.light', color: 'secondary.main', mr: 2 }}>
                  <AssessmentIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Test Results
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {dashboardStats?.testResultsCount || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'error.light', color: 'error.main', mr: 2 }}>
                  <ImageIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Visualizations
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {dashboardStats?.visualizationsCount || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'orange.light', color: 'orange.main', mr: 2 }}>
                  <BarChartIcon />
                </Box>
                <Typography variant="subtitle2" sx={{
                  color: "text.secondary"
                }}>
                  Benchmarks
                </Typography>
              </Box>
              <Typography variant="h4" sx={{
                fontWeight: "bold"
              }}>
                {dashboardStats?.benchmarksCount || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {!isAuthenticated && (
        <Box sx={{ px: 3, py: 4 }}>
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
