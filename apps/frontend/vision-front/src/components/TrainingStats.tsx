import React from 'react';
import { Box, Card, CardContent, Typography, Chip, useTheme, alpha } from '@mui/material';
import {
  AccessTime as TimeIcon,
  Memory as CpuIcon,
  DeveloperBoard as GpuIcon,
  AttachMoney as CostIcon,
  Storage as StorageIcon
} from '@mui/icons-material';
import { useFormatCost } from '../costing/useCosting';

interface TrainingStatsProps {
  stats: {
    totalTrainings: number;
    totalTime: number;
    /** absent when no project involved has priced its hardware */
    totalCpuCost?: number;
    totalGpuCost?: number;
    totalCost?: number;
    /** ISO code from the backend; 'MIXED' when the total spans currencies */
    currency?: string;
  };
  selectedTags: string[];
}

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => {
  const theme = useTheme();
  
  return (
    <Card 
      elevation={0} 
      sx={{ 
        height: '100%', 
        bgcolor: alpha(color, 0.05),
        border: `1px solid ${alpha(color, 0.1)}`,
        borderRadius: 2,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 12px ${alpha(color, 0.15)}`
        }
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2
          }}>
          <Box 
            sx={{ 
              p: 1.5, 
              borderRadius: 2, 
              bgcolor: alpha(color, 0.1),
              color: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {icon}
          </Box>
          <Box>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                fontWeight: 500
              }}>
              {title}
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: theme.palette.text.primary
              }}>
              {value}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export const TrainingStats: React.FC<TrainingStatsProps> = ({ stats, selectedTags }) => {
  const theme = useTheme();
  const formatCost = useFormatCost();

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h6" sx={{
          fontWeight: 600
        }}>
          Overview
        </Typography>
        {selectedTags.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              Filtered by:
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {selectedTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    height: '24px',
                    fontSize: '0.75rem',
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: theme.palette.primary.main,
                    fontWeight: 500
                  }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: "grid",

          gridTemplateColumns: { 
            xs: '1fr', 
            sm: 'repeat(2, 1fr)', 
            md: 'repeat(5, 1fr)' 
          },

          gap: 2
        }}>
        <StatCard
          title="Total Trainings"
          value={stats.totalTrainings.toString()}
          icon={<StorageIcon />}
          color={theme.palette.primary.main}
        />
        <StatCard
          title="Total Time"
          value={`${Math.round(stats.totalTime / 3600 * 10) / 10}h`}
          icon={<TimeIcon />}
          color={theme.palette.info.main}
        />
        <StatCard
          title="CPU Cost"
          value={formatCost(stats.totalCpuCost, stats.currency)}
          icon={<CpuIcon />}
          color={theme.palette.success.main}
        />
        <StatCard
          title="GPU Cost"
          value={formatCost(stats.totalGpuCost, stats.currency)}
          icon={<GpuIcon />}
          color={theme.palette.warning.main}
        />
        <StatCard
          title="Total Cost"
          value={formatCost(stats.totalCost, stats.currency)}
          icon={<CostIcon />}
          color={theme.palette.error.main}
        />
      </Box>
    </Box>
  );
};

export default TrainingStats;
