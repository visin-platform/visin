import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Divider,
  Paper,
} from '@mui/material';
import { Training, Epoch } from '../types';

interface TrainingOverviewCardProps {
  training: Training;
  epochs: Epoch[];
}

const TrainingOverviewCard: React.FC<TrainingOverviewCardProps> = ({
  training,
  epochs,
}) => {
  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  const formatNumber = (value: any, decimals: number = 3): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  const calculateTrainingCost = () => {
    if (!epochs.length) return null;

    const totalSeconds = epochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0);
    const totalHours = totalSeconds / 3600;

    const CPU_RATE_PER_HOUR = 0.006;
    const GPU_RATE_PER_HOUR = 0.20;

    const cpuHours = totalHours;
    const gpuHours = totalHours;

    const cpuCost = cpuHours * CPU_RATE_PER_HOUR;
    const gpuCost = gpuHours * GPU_RATE_PER_HOUR;
    const totalCost = cpuCost + gpuCost;

    return {
      totalHours,
      cpuHours,
      gpuHours,
      cpuCost,
      gpuCost,
      totalCost
    };
  };

  const getStatusColor = (status: Training['status']): 'success' | 'error' | 'default' | 'warning' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'default';
      case 'failed':
        return 'error';
      case 'pending':
        return 'default';
      default:
        return 'default';
    }
  };

  const costData = calculateTrainingCost();
  const lastEpoch = epochs.length > 0 ? epochs[epochs.length - 1] : null;

  return (
    <Card sx={{ mb: 3, boxShadow: 2, borderRadius: 2 }}>
      <CardContent sx={{ p: 0 }}>
        {/* Header Section */}
        <Box sx={{ p: 3, pb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box sx={{ flex: 1, mr: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5, color: 'text.primary' }}>
                {training.name}
              </Typography>
              {training.description && (
                <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                  {training.description}
                </Typography>
              )}
            </Box>
            <Chip
              label={training.status}
              color={getStatusColor(training.status)}
              variant="filled"
              sx={{
                textTransform: 'capitalize',
                fontWeight: 500,
                fontSize: '0.875rem',
                px: 1,
                height: '32px'
              }}
            />
          </Box>

          {/* Basic Info */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, mt: 1 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                Dataset ID
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {training.datasetId || 'Not specified'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                Training UUID
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {training.training_uuid || training.uuid || 'Not available'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* Training Progress & Metrics */}
        {epochs.length > 0 && (
          <Box sx={{ p: 3 }}>
            {/* Training Summary */}
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'text.primary' }}>
              Training Summary
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Total Epochs
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {epochs.length}
                </Typography>
              </Paper>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Total Time
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {formatTime(epochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0))}
                </Typography>
              </Paper>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Avg per Epoch
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {formatTime(epochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0) / epochs.length)}
                </Typography>
              </Paper>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                  Peak Time
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {formatTime(Math.max(...epochs.map(e => e.epoch_time || 0)))}
                </Typography>
              </Paper>
            </Box>

            {/* Cost Analysis */}
            {costData && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'text.primary' }}>
                  Cost Analysis
                </Typography>
                <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      Total Cost: €{costData.totalCost.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {costData.totalHours.toFixed(1)} hours
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                        CPU Cost (€0.006/h)
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                        €{costData.cpuCost.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                        GPU Cost (€0.20/h)
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'warning.main' }}>
                        €{costData.gpuCost.toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Box>
            )}

            {/* Latest Performance */}
            {lastEpoch && (
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'text.primary' }}>
                  Latest Performance (Epoch {lastEpoch.epoch})
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                      Train Loss
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'error.main' }}>
                      {formatNumber(lastEpoch.results?.train?.loss)}
                    </Typography>
                  </Paper>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                      Val Loss
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'error.main' }}>
                      {formatNumber(lastEpoch.results?.val?.loss)}
                    </Typography>
                  </Paper>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                      Train mIoU
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {formatNumber(lastEpoch.results?.train?.mean_iou)}
                    </Typography>
                  </Paper>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
                      Val mIoU
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {formatNumber(lastEpoch.results?.val?.mean_iou)}
                    </Typography>
                  </Paper>
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Footer with timestamps */}
        <Divider />
        <Box sx={{ p: 2, bgcolor: 'grey.25' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Created
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                {formatDate(training.createdAt)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Last Updated
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                {formatDate(training.updatedAt)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default TrainingOverviewCard;