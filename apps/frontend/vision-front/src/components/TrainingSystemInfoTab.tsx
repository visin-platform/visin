import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
  useTheme,
  alpha
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { 
  Memory as MemoryIcon, 
  Speed as SpeedIcon, 
  Bolt as BoltIcon, 
  DeviceThermostat as ThermostatIcon 
} from '@mui/icons-material';
import { Epoch } from '../types';

interface TrainingSystemInfoTabProps {
  epochs: Epoch[];
}

const TrainingSystemInfoTab: React.FC<TrainingSystemInfoTabProps> = ({ epochs }) => {
  const theme = useTheme();
  
  // Filter epochs that have system_info
  const epochsWithSystemInfo = epochs.filter(epoch => epoch.results?.system_info);

  if (epochsWithSystemInfo.length === 0) {
    return (
      <Paper 
        elevation={0} 
        variant="outlined" 
        sx={{ 
          p: 6, 
          textAlign: 'center', 
          borderRadius: 2,
          bgcolor: 'background.paper'
        }}
      >
        <SpeedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No system information available
        </Typography>
        <Typography variant="body2" color="text.secondary">
          System metrics are recorded in epoch.json files. Upload epoch data to view system performance charts.
        </Typography>
      </Paper>
    );
  }

  // Prepare data for charts
  const chartData = epochsWithSystemInfo.map(epoch => ({
    epoch: epoch.epoch,
    memoryUsedGb: epoch.results?.system_info?.memory_used_gb || 0,
    memoryMaxGb: epoch.results?.system_info?.memory_max_gb || 0,
    gpuMemoryUsedGb: epoch.results?.system_info?.gpu?.gpu_0?.memory_used_gb || 0,
    gpuMemoryMaxGb: epoch.results?.system_info?.gpu?.gpu_0?.memory_max_gb || 0,
    gpuMemoryReservedGb: epoch.results?.system_info?.gpu?.gpu_0?.memory_reserved_gb || 0,
    gpuTemperature: epoch.results?.system_info?.gpu?.gpu_0?.temperature_celsius || 0,
    gpuPower: epoch.results?.system_info?.gpu?.gpu_0?.power_watts || 0,
    gpuPowerLimit: epoch.results?.system_info?.gpu?.gpu_0?.power_limit_watts || 0,
    gpuMemoryUtilization: epoch.results?.system_info?.gpu?.gpu_0?.memory_utilization_percent || 0,
    gpuFanSpeed: epoch.results?.system_info?.gpu?.gpu_0?.fan_speed_percent || 0,
  }));

  const epochNumbers = chartData.map(d => d.epoch);

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          System Metrics
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Performance metrics collected during training epochs, including CPU memory, GPU memory, power usage, and thermal stats.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Memory Usage GB */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <MemoryIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                  System Memory Usage
                </Typography>
              </Box>
              <Box height={300} width="100%">
                <LineChart
                  xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                  series={[
                    {
                      data: chartData.map(d => d.memoryUsedGb),
                      label: 'Used (GB)',
                      color: theme.palette.success.main,
                      showMark: false,
                      area: true,
                    },
                    {
                      data: chartData.map(d => d.memoryMaxGb),
                      label: 'Max (GB)',
                      color: theme.palette.success.light,
                      showMark: false
                    },
                  ]}
                  margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
                  slotProps={{ legend: { hidden: false, position: { vertical: 'top', horizontal: 'right' } } }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* GPU Memory Usage */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <MemoryIcon sx={{ color: '#9c27b0', mr: 1 }} />
                <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                  GPU Memory Usage
                </Typography>
              </Box>
              <Box height={300} width="100%">
                <LineChart
                  xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                  series={[
                    {
                      data: chartData.map(d => d.gpuMemoryUsedGb),
                      label: 'Used (GB)',
                      color: '#9c27b0',
                      showMark: false,
                      area: true,
                    },
                    {
                      data: chartData.map(d => d.gpuMemoryReservedGb),
                      label: 'Reserved (GB)',
                      color: alpha('#9c27b0', 0.5),
                      showMark: false
                    },
                    {
                      data: chartData.map(d => d.gpuMemoryMaxGb),
                      label: 'Max (GB)',
                      color: '#4caf50',
                      showMark: false
                    },
                  ]}
                  margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
                  slotProps={{ legend: { hidden: false, position: { vertical: 'top', horizontal: 'right' } } }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* GPU Power */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <BoltIcon sx={{ color: '#f57c00', mr: 1 }} />
                <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                  GPU Power Consumption
                </Typography>
              </Box>
              <Box height={300} width="100%">
                <LineChart
                  xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                  series={[
                    {
                      data: chartData.map(d => d.gpuPower),
                      label: 'Power (W)',
                      color: '#f57c00',
                      showMark: false,
                      area: true,
                    },
                    {
                      data: chartData.map(d => d.gpuPowerLimit),
                      label: 'Limit (W)',
                      color: theme.palette.text.disabled,
                      showMark: false,
                    },
                  ]}
                  margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
                  slotProps={{ legend: { hidden: false, position: { vertical: 'top', horizontal: 'right' } } }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* GPU Fan Speed & Temp */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <ThermostatIcon sx={{ color: '#00bcd4', mr: 1 }} />
                <Typography variant="h6" fontSize="1rem" fontWeight={600}>
                  GPU Temperature & Fan Speed
                </Typography>
              </Box>
              <Box height={300} width="100%">
                <LineChart
                  xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                  yAxis={[
                    { id: 'temp', label: 'Temp (°C)' },
                    { id: 'fan', label: 'Fan (%)' }
                  ]}
                  series={[
                    {
                      data: chartData.map(d => d.gpuTemperature),
                      label: 'Temp (°C)',
                      color: '#f44336',
                      showMark: false,
                      yAxisKey: 'temp'
                    },
                    {
                      data: chartData.map(d => d.gpuFanSpeed),
                      label: 'Fan Speed %',
                      color: '#00bcd4',
                      showMark: false,
                      yAxisKey: 'fan'
                    },
                  ]}
                  rightAxis="fan"
                  margin={{ left: 50, right: 50, top: 20, bottom: 30 }}
                  slotProps={{ legend: { hidden: false, position: { vertical: 'top', horizontal: 'right' } } }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TrainingSystemInfoTab;