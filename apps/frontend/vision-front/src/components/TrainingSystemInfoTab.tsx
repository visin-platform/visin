import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

interface TrainingSystemInfoTabProps {
  epochs: Epoch[];
}

const TrainingSystemInfoTab: React.FC<TrainingSystemInfoTabProps> = ({ epochs }) => {
  // Filter epochs that have system_info
  const epochsWithSystemInfo = epochs.filter(epoch => epoch.results?.system_info);

  if (epochsWithSystemInfo.length === 0) {
    return (
      <Alert severity="info">
        No system information available for this training. System info is recorded in epoch.json files.
      </Alert>
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
      <Typography variant="h5" gutterBottom>
        System Information Over Training
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        System metrics collected during training epochs, including CPU, memory, and GPU usage.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 3 }}>
        {/* Memory Usage GB */}
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Memory Usage (GB)
              </Typography>
              <LineChart
                xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                series={[
                  {
                    data: chartData.map(d => d.memoryUsedGb),
                    label: 'Used (GB)',
                    color: '#4caf50',
                    showMark: false
                  },
                  {
                    data: chartData.map(d => d.memoryMaxGb),
                    label: 'Max (GB)',
                    color: '#81c784',
                    showMark: false
                  },
                ]}
                height={300}
                margin={{ left: 70, right: 30, top: 30, bottom: 50 }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* GPU Memory Usage */}
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                GPU Memory Usage (GB)
              </Typography>
              <LineChart
                xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                series={[
                  {
                    data: chartData.map(d => d.gpuMemoryUsedGb),
                    label: 'Used (GB)',
                    color: '#9c27b0',
                    showMark: false
                  },
                  {
                    data: chartData.map(d => d.gpuMemoryReservedGb),
                    label: 'Reserved (GB)',
                    color: '#607d8b',
                    showMark: false
                  },
                  {
                    data: chartData.map(d => d.gpuMemoryMaxGb),
                    label: 'Max (GB)',
                    color: '#4caf50',
                    showMark: false
                  },
                ]}
                height={300}
                margin={{ left: 70, right: 30, top: 30, bottom: 50 }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* GPU Power */}
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                GPU Power (W)
              </Typography>
              <LineChart
                xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                series={[
                  {
                    data: chartData.map(d => d.gpuPower),
                    label: 'Power (W)',
                    color: '#f57c00',
                    showMark: false
                  },
                  {
                    data: chartData.map(d => d.gpuPowerLimit),
                    label: 'Power Limit (W)',
                    color: '#424242',
                    showMark: false
                  },
                ]}
                height={300}
                margin={{ left: 70, right: 30, top: 30, bottom: 50 }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* GPU Fan Speed */}
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                GPU Fan Speed (%)
              </Typography>
              <LineChart
                xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
                series={[
                  {
                    data: chartData.map(d => d.gpuFanSpeed),
                    label: 'Fan Speed %',
                    color: '#00bcd4',
                    showMark: false
                  },
                ]}
                height={300}
                margin={{ left: 70, right: 30, top: 30, bottom: 50 }}
              />
            </CardContent>
          </Card>
        </Box>

      </Box>
    </Box>
  );
};

export default TrainingSystemInfoTab;