import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Divider,
  Paper,
  Grid,
  Stack,
  useTheme,
  alpha,
  Tooltip
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Storage as StorageIcon,
  Fingerprint as FingerprintIcon,
  CalendarToday as CalendarIcon,
  Update as UpdateIcon,
  Speed as SpeedIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Timer as TimerIcon
} from '@mui/icons-material';
import { Training, Epoch } from '../types';
import { costOf } from '../costing/costing';
import { useCosting, useFormatCost } from '../costing/useCosting';

interface TrainingOverviewCardProps {
  training: Training;
  epochs: Epoch[];
}

const TrainingOverviewCard: React.FC<TrainingOverviewCardProps> = ({
  training,
  epochs,
}) => {
  const theme = useTheme();
  const costing = useCosting();
  const formatCost = useFormatCost();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  const formatNumber = (value: number | undefined, decimals: number = 3): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  const calculateTrainingCost = () => {
    if (!epochs.length) return null;

    const totalSeconds = epochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0);
    const { totalHours, cpuCost, gpuCost, totalCost } = costOf(totalSeconds, costing);

    // CPU and GPU are billed for the same wall-clock hours; they differ only in rate.
    return { totalHours, cpuHours: totalHours, gpuHours: totalHours, cpuCost, gpuCost, totalCost };
  };

  const getStatusColor = (status: Training['status']): 'success' | 'error' | 'default' | 'warning' | 'info' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'info';
      case 'failed':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const costData = calculateTrainingCost();
  const lastEpoch = epochs.length > 0 ? epochs[epochs.length - 1] : null;

  const InfoItem = ({ icon, label, value, copyable = false }: { icon: React.ReactNode, label: string, value: string, copyable?: boolean }) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start"
      }}>
      <Box sx={{ color: 'text.secondary', mr: 1.5, mt: 0.5 }}>
        {icon}
      </Box>
      <Box>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 500
          }}>
          {label}
        </Typography>
        <Tooltip title={copyable ? "Click to copy" : ""} arrow placement="top">
          <Typography
            variant="body2"
            onClick={() => {
              if (copyable) navigator.clipboard.writeText(value);
            }}
            sx={{
              fontWeight: 500,
              fontFamily: copyable ? 'monospace' : 'inherit',
              cursor: copyable ? 'pointer' : 'default',
              '&:hover': copyable ? { color: 'primary.main' } : {}
            }}>
            {value}
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );

  const MetricCard = ({ title, value, subValue, icon, color }: { title: string, value: string, subValue?: string, icon: React.ReactNode, color: string }) => (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: '100%',
        bgcolor: alpha(color, 0.04),
        borderColor: alpha(color, 0.2),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          mb: 1
        }}>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 600,
            textTransform: "uppercase"
          }}>
          {title}
        </Typography>
        <Box sx={{ color: color, opacity: 0.8 }}>
          {icon}
        </Box>
      </Box>
      <Box>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            color: "text.primary"
          }}>
          {value}
        </Typography>
        {subValue && (
          <Typography variant="caption" sx={{
            color: "text.secondary"
          }}>
            {subValue}
          </Typography>
        )}
      </Box>
    </Paper>
  );

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        <Grid container spacing={4}>
          {/* Left Column: Info & Metadata */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack spacing={3}>
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1
                  }}>
                  <Typography variant="h6" sx={{
                    fontWeight: 700
                  }}>
                    {training.name}
                  </Typography>
                  <Chip
                    label={training.status}
                    color={getStatusColor(training.status)}
                    size="small"
                    sx={{ fontWeight: 600, textTransform: 'capitalize', height: 24 }}
                  />
                </Box>
                {training.description && (
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    {training.description}
                  </Typography>
                )}
              </Box>

              <Divider />

              <Stack spacing={2}>
                <InfoItem 
                  icon={<FingerprintIcon fontSize="small" />} 
                  label="Training UUID" 
                  value={training.training_uuid || training.uuid || 'Not available'} 
                  copyable
                />
                <InfoItem 
                  icon={<StorageIcon fontSize="small" />} 
                  label="Dataset ID" 
                  value={training.datasetId || 'Not specified'} 
                  copyable
                />
                <InfoItem 
                  icon={<CalendarIcon fontSize="small" />} 
                  label="Created At" 
                  value={formatDate(training.createdAt)} 
                />
                <InfoItem 
                  icon={<UpdateIcon fontSize="small" />} 
                  label="Last Updated" 
                  value={formatDate(training.updatedAt)} 
                />
              </Stack>
            </Stack>
          </Grid>

          {/* Right Column: Metrics & Stats */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={3}>
              <Box>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  sx={{
                    fontWeight: 600,
                    color: "text.secondary"
                  }}>
                  Training Summary
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <MetricCard 
                      title="Epochs" 
                      value={epochs.length.toString()} 
                      icon={<SpeedIcon />} 
                      color={theme.palette.primary.main} 
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <MetricCard 
                      title="Total Time" 
                      value={formatTime(epochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0))} 
                      icon={<AccessTimeIcon />} 
                      color={theme.palette.info.main} 
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <MetricCard 
                      title="Avg / Epoch" 
                      value={epochs.length ? formatTime(epochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0) / epochs.length) : '-'} 
                      icon={<TimerIcon />} 
                      color={theme.palette.secondary.main} 
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <MetricCard 
                      title="Est. Cost" 
                      value={costData ? formatCost(costData.totalCost) : '-'}
                      subValue={costData ? `CPU: ${formatCost(costData.cpuCost)} | GPU: ${formatCost(costData.gpuCost)}` : undefined}
                      icon={<MoneyIcon />} 
                      color={theme.palette.warning.main} 
                    />
                  </Grid>
                </Grid>
              </Box>

              {lastEpoch && (
                <Box>
                  <Typography
                    variant="subtitle2"
                    gutterBottom
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary"
                    }}>
                    Latest Performance (Epoch {lastEpoch.epoch})
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <MetricCard 
                        title="Train Loss" 
                        value={formatNumber(lastEpoch.results?.train?.loss)} 
                        icon={<TrendingDownIcon />} 
                        color={theme.palette.error.main} 
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <MetricCard 
                        title="Val Loss" 
                        value={formatNumber(lastEpoch.results?.val?.loss)} 
                        icon={<TrendingDownIcon />} 
                        color={theme.palette.error.dark} 
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <MetricCard 
                        title="Train mIoU" 
                        value={formatNumber(lastEpoch.results?.train?.mean_iou)} 
                        icon={<TrendingUpIcon />} 
                        color={theme.palette.success.main} 
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <MetricCard 
                        title="Val mIoU" 
                        value={formatNumber(lastEpoch.results?.val?.mean_iou)} 
                        icon={<TrendingUpIcon />} 
                        color={theme.palette.success.dark} 
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default TrainingOverviewCard;