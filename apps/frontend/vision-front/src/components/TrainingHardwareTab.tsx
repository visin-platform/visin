import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

interface TrainingHardwareTabProps {
  epochs: Epoch[];
}

const TrainingHardwareTab: React.FC<TrainingHardwareTabProps> = ({ epochs }) => {
  if (epochs.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No epochs available to display hardware metrics.
        </Typography>
      </Paper>
    );
  }

  const epochNumbers = epochs.map(e => e.epoch);

  // Extract GPU metrics
  const gpuUtilData = epochs.map(epoch => {
    const gpu = epoch.results?.system?.gpu as any;
    return gpu?.gpu_util ?? null;
  });

  const gpuMemoryUtilData = epochs.map(epoch => {
    const gpu = epoch.results?.system?.gpu as any;
    return gpu?.memory_util ?? null;
  });

  const gpuMemoryUsedData = epochs.map(epoch => {
    const gpu = epoch.results?.system?.gpu as any;
    return gpu?.memory_used ? gpu.memory_used / 1024 : null; // Convert to GB
  });

  const gpuMemoryTotalData = epochs.map(epoch => {
    const gpu = epoch.results?.system?.gpu as any;
    return gpu?.memory_total ? gpu.memory_total / 1024 : null; // Convert to GB
  });

  const gpuTempData = epochs.map(epoch => {
    const gpu = epoch.results?.system?.gpu as any;
    return gpu?.temperature ?? null;
  });

  // Extract CPU metrics
  const cpuUtilData = epochs.map(epoch => {
    const cpu = epoch.results?.system?.cpu as any;
    return cpu?.percent ?? null;
  });

  const systemMemoryUsedData = epochs.map(epoch => {
    const cpu = epoch.results?.system?.cpu as any;
    return cpu?.memory_used ? cpu.memory_used / (1024**3) : null; // Convert to GB
  });

  const systemMemoryTotalData = epochs.map(epoch => {
    const cpu = epoch.results?.system?.cpu as any;
    return cpu?.memory_total ? cpu.memory_total / (1024**3) : null; // Convert to GB
  });

  const systemMemoryPercentData = epochs.map(epoch => {
    const cpu = epoch.results?.system?.cpu as any;
    return cpu?.memory_percent ?? null;
  });

  const cpuFreqData = epochs.map(epoch => {
    const cpu = epoch.results?.system?.cpu as any;
    return cpu?.freq_current ? cpu.freq_current / 1000 : null; // Convert to GHz
  });

  // Check if we have any hardware data
  const hasHardwareData = gpuUtilData.some(v => v !== null) ||
                         gpuMemoryUtilData.some(v => v !== null) ||
                         gpuMemoryUsedData.some(v => v !== null) ||
                         gpuTempData.some(v => v !== null) ||
                         cpuUtilData.some(v => v !== null) ||
                         systemMemoryUsedData.some(v => v !== null) ||
                         systemMemoryTotalData.some(v => v !== null) ||
                         systemMemoryPercentData.some(v => v !== null) ||
                         cpuFreqData.some(v => v !== null);

  if (!hasHardwareData) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No hardware metrics data available in the epochs.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* GPU Metrics */}
      {(gpuUtilData.some(v => v !== null) || gpuMemoryUtilData.some(v => v !== null) || gpuTempData.some(v => v !== null)) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            GPU Metrics Over Epochs
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            GPU utilization, memory usage, and temperature monitoring during training.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                ...(gpuUtilData.some(v => v !== null) ? [{
                  data: gpuUtilData,
                  label: 'GPU Utilization (%)',
                  color: '#1976d2',
                  showMark: false
                }] : []),
                ...(gpuMemoryUtilData.some(v => v !== null) ? [{
                  data: gpuMemoryUtilData,
                  label: 'GPU Memory Utilization (%)',
                  color: '#d32f2f',
                  showMark: false
                }] : []),
                ...(gpuTempData.some(v => v !== null) ? [{
                  data: gpuTempData,
                  label: 'GPU Temperature (°C)',
                  color: '#f57c00',
                  showMark: false
                }] : [])
              ]}
              margin={{ top: 10, bottom: 80, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'row',
                  position: { vertical: 'bottom', horizontal: 'middle' },
                  padding: 0
                }
              }}
            />
          </Box>
        </Paper>
      )}

      {/* GPU Memory Usage */}
      {(gpuMemoryUsedData.some(v => v !== null) || gpuMemoryTotalData.some(v => v !== null)) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            GPU Memory Usage Over Epochs
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            GPU memory allocation in GB during training.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                ...(gpuMemoryUsedData.some(v => v !== null) ? [{
                  data: gpuMemoryUsedData,
                  label: 'GPU Memory Used (GB)',
                  color: '#388e3c',
                  showMark: false
                }] : []),
                ...(gpuMemoryTotalData.some(v => v !== null) ? [{
                  data: gpuMemoryTotalData,
                  label: 'GPU Memory Total (GB)',
                  color: '#7b1fa2',
                  showMark: false
                }] : [])
              ]}
              margin={{ top: 10, bottom: 80, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'row',
                  position: { vertical: 'bottom', horizontal: 'middle' },
                  padding: 0
                }
              }}
            />
          </Box>
        </Paper>
      )}

      {/* CPU and System Memory */}
      {(cpuUtilData.some(v => v !== null) || systemMemoryPercentData.some(v => v !== null) || systemMemoryUsedData.some(v => v !== null) || cpuFreqData.some(v => v !== null) || systemMemoryTotalData.some(v => v !== null)) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            CPU and System Memory Over Epochs
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            CPU utilization, frequency, and system memory usage during training.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                ...(cpuUtilData.some(v => v !== null) ? [{
                  data: cpuUtilData,
                  label: 'CPU Utilization (%)',
                  color: '#1976d2',
                  showMark: false
                }] : []),
                ...(cpuFreqData.some(v => v !== null) ? [{
                  data: cpuFreqData,
                  label: 'CPU Frequency (GHz)',
                  color: '#388e3c',
                  showMark: false
                }] : []),
                ...(systemMemoryPercentData.some(v => v !== null) ? [{
                  data: systemMemoryPercentData,
                  label: 'System Memory Usage (%)',
                  color: '#d32f2f',
                  showMark: false
                }] : []),
                ...(systemMemoryUsedData.some(v => v !== null) ? [{
                  data: systemMemoryUsedData,
                  label: 'System Memory Used (GB)',
                  color: '#f57c00',
                  showMark: false
                }] : []),
                ...(systemMemoryTotalData.some(v => v !== null) ? [{
                  data: systemMemoryTotalData,
                  label: 'System Memory Total (GB)',
                  color: '#9c27b0',
                  showMark: false
                }] : [])
              ]}
              margin={{ top: 10, bottom: 80, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'row',
                  position: { vertical: 'bottom', horizontal: 'middle' },
                  padding: 0
                }
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default TrainingHardwareTab;