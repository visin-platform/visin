import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Paper,
} from '@mui/material';
import { LineChart, lineClasses } from '@mui/x-charts';
import { useActivePalette, useChartColors } from '@visin/frontend-core';
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
  const colors = useChartColors();
  const palette = useActivePalette();
  
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
        <Typography variant="h6" gutterBottom sx={{
          color: "text.secondary"
        }}>
          No system information available
        </Typography>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          System metrics are recorded in epoch.json files. Upload epoch data to view system performance charts.
        </Typography>
      </Paper>
    );
  }

  // A reading an epoch did not report is a gap in its line; `|| 0` drew it as a
  // drop to zero, and a GPU without a fan as one idling at 0%.
  const gpuOf = (epoch: Epoch) => epoch.results?.system_info?.gpu?.gpu_0;
  const read = (pick: (epoch: Epoch) => number | undefined) =>
    epochsWithSystemInfo.map(epoch => pick(epoch) ?? null);

  const epochNumbers = epochsWithSystemInfo.map(epoch => epoch.epoch);
  const secondaryInk = palette.text.disabled;

  // One unit per chart: two scales on one plot invite reading a crossing of the
  // lines as meaning something.
  const cards: MetricCardProps[] = [
    {
      title: 'System Memory Usage',
      icon: <MemoryIcon sx={{ color: colors.slot(0) }} />,
      unit: 'GB',
      series: [
        { id: 'memory-used', label: 'Used', data: read(e => e.results?.system_info?.memory_used_gb), color: colors.slot(0), area: true },
        { id: 'memory-max', label: 'Max', data: read(e => e.results?.system_info?.memory_max_gb), color: colors.slot(1) }
      ]
    },
    {
      title: 'GPU Memory Usage',
      icon: <MemoryIcon sx={{ color: colors.slot(0) }} />,
      unit: 'GB',
      series: [
        { id: 'gpu-memory-used', label: 'Used', data: read(e => gpuOf(e)?.memory_used_gb), color: colors.slot(0), area: true },
        { id: 'gpu-memory-reserved', label: 'Reserved', data: read(e => gpuOf(e)?.memory_reserved_gb), color: colors.slot(1) },
        { id: 'gpu-memory-max', label: 'Max', data: read(e => gpuOf(e)?.memory_max_gb), color: colors.slot(2) }
      ]
    },
    {
      title: 'GPU Power Consumption',
      icon: <BoltIcon sx={{ color: colors.slot(0) }} />,
      unit: 'W',
      series: [
        { id: 'gpu-power', label: 'Power', data: read(e => gpuOf(e)?.power_watts), color: colors.slot(0), area: true },
        { id: 'gpu-power-limit', label: 'Limit', data: read(e => gpuOf(e)?.power_limit_watts), color: secondaryInk }
      ]
    },
    {
      title: 'GPU Temperature',
      icon: <ThermostatIcon sx={{ color: colors.slot(0) }} />,
      unit: '°C',
      series: [{ id: 'gpu-temperature', label: 'Temperature', data: read(e => gpuOf(e)?.temperature_celsius), color: colors.slot(0) }]
    },
    {
      title: 'GPU Fan Speed',
      icon: <SpeedIcon sx={{ color: colors.slot(0) }} />,
      unit: '%',
      series: [{ id: 'gpu-fan', label: 'Fan speed', data: read(e => gpuOf(e)?.fan_speed_percent), color: colors.slot(0) }]
    }
  ].filter(card => card.series.some(line => line.data.some(value => value !== null)));

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
          System Metrics
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Performance metrics collected during training epochs, including CPU memory, GPU memory, power usage, and thermal stats.
        </Typography>
      </Box>
      {cards.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          The epochs carry system information, but none of the readings charted here.
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {cards.map(card => (
            <Grid key={card.title} size={{ xs: 12, md: 6 }}>
              <MetricCard {...card} epochNumbers={epochNumbers} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

interface MetricSeries {
  id: string;
  label: string;
  data: (number | null)[];
  color: string;
  area?: boolean;
}

interface MetricCardProps {
  title: string;
  icon: React.ReactNode;
  /** The one unit every line in the card is measured in; labels the y-axis and each value. */
  unit: string;
  series: MetricSeries[];
}

const MetricCard: React.FC<MetricCardProps & { epochNumbers: number[] }> = ({ title, icon, unit, series, epochNumbers }) => (
  <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {icon}
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>
      <Box sx={{ height: 300, width: '100%' }}>
        <LineChart
          xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
          yAxis={[{ label: unit }]}
          series={series
            .filter(line => line.data.some(value => value !== null))
            .map(({ id, label, data, color, area }) => ({
              id,
              label,
              data,
              color,
              area,
              showMark: false,
              valueFormatter: (value: number | null) => (value === null ? '–' : `${value.toLocaleString()} ${unit}`)
            }))}
          margin={{ left: 50, right: 20, top: 20, bottom: 30 }}
          slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
          // A light wash under the line, so a filled series does not hide the ones drawn over it.
          sx={{ [`& .${lineClasses.area}`]: { fillOpacity: 0.18 } }}
        />
      </Box>
    </CardContent>
  </Card>
);

export default TrainingSystemInfoTab;