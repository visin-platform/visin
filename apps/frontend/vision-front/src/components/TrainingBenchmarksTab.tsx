import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Chip,
  Divider,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { Benchmark } from '../types';
import { benchmarkService } from '../services/benchmarkService';

interface TrainingBenchmarksTabProps {
  training_uuid: string;
  isAuthenticated: boolean;
}

const TrainingBenchmarksTab: React.FC<TrainingBenchmarksTabProps> = ({ training_uuid, isAuthenticated }) => {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBenchmarks();
  }, [training_uuid]);

  const loadBenchmarks = async () => {
    try {
      setLoading(true);
      const response = await benchmarkService.getBenchmarks({
        training_uuid,
        sortBy: 'timestamp',
        order: 'desc',
      });
      setBenchmarks(response.data.benchmarks || []);
      setError(null);
    } catch (err) {
      setError('Failed to load benchmarks');
      console.error('Error loading benchmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBenchmark = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this benchmark?')) return;

    try {
      await benchmarkService.deleteBenchmark(id);
      loadBenchmarks();
    } catch (err) {
      setError('Failed to delete benchmark');
      console.error('Error deleting benchmark:', err);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6" component="h2">
          Training Benchmarks
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {benchmarks.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary" gutterBottom>
            No benchmarks found for this training
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Upload benchmark data to track model performance metrics
          </Typography>
        </Paper>
      ) : (
        <Box>
          {benchmarks.map((benchmark) => {
            // Group results by device type
            const gpuResults = benchmark.results.filter(result =>
              result.device_type === 'cuda' || result.device?.toLowerCase().includes('gpu') || result.device?.toLowerCase().includes('cuda')
            );
            const cpuResults = benchmark.results.filter(result =>
              result.device_type === 'cpu' || result.device?.toLowerCase().includes('cpu')
            );

            // Get system info from benchmark
            const benchmarkSystemInfo = benchmark.system_info;

            return (
              <Card key={benchmark._id} sx={{ mb: 3 }}>
                <CardContent>
                  {/* Header with timestamp and delete button */}
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" component="h3">
                      Benchmark - {formatTimestamp(benchmark.timestamp)}
                    </Typography>
                    {isAuthenticated && (
                      <Tooltip title="Delete Benchmark">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteBenchmark(benchmark._id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>

                  {/* System Information */}
                  <Box mb={3}>
                    <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <SettingsIcon sx={{ mr: 1 }} />
                      System Information
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label={`CPU Cores: ${benchmarkSystemInfo?.cpu_count || 'N/A'}`}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={`Logical CPUs: ${benchmarkSystemInfo?.cpu_count_logical || 'N/A'}`}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={`Memory: ${benchmarkSystemInfo?.memory_total_gb ? benchmarkSystemInfo.memory_total_gb.toFixed(1) + ' GB' : 'N/A'}`}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={`GPU: ${benchmarkSystemInfo?.gpu_name || 'N/A'}`}
                        variant="outlined"
                        size="small"
                        color="secondary"
                      />
                      <Chip
                        label={`GPU Memory: ${benchmarkSystemInfo?.gpu_memory_total_gb ? benchmarkSystemInfo.gpu_memory_total_gb.toFixed(1) + ' GB' : 'N/A'}`}
                        variant="outlined"
                        size="small"
                        color="secondary"
                      />
                      <Chip
                        label={`GPU Driver: ${benchmarkSystemInfo?.gpu_driver || 'N/A'}`}
                        variant="outlined"
                        size="small"
                        color="secondary"
                      />
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 3 }} />

                  {/* CPU vs GPU Comparison Table */}
                  <TableContainer component={Paper}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Metric</strong></TableCell>
                          <TableCell align="center"><strong>CPU</strong></TableCell>
                          <TableCell align="center"><strong>GPU</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>

                        {/* Parameters & FLOPs */}
                        <TableRow>
                          <TableCell>Trainable Parameters (M)</TableCell>
                          <TableCell align="center">{cpuResults[0]?.trainable_parameters_m?.toFixed(2) || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.trainable_parameters_m?.toFixed(2) || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>FLOPs (G)</TableCell>
                          <TableCell align="center">{cpuResults[0]?.flops_giga?.toFixed(2) || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.flops_giga?.toFixed(2) || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>FLOPs Method</TableCell>
                          <TableCell align="center">{cpuResults[0]?.flops_method || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.flops_method || 'N/A'}</TableCell>
                        </TableRow>

                        {/* Performance Metrics */}
                        <TableRow>
                          <TableCell>Mean Time (ms)</TableCell>
                          <TableCell align="center">
                            {cpuResults[0]?.mean_time_ms && cpuResults[0]?.std_time_ms
                              ? `${cpuResults[0].mean_time_ms.toFixed(2)} ± ${cpuResults[0].std_time_ms.toFixed(2)}`
                              : cpuResults[0]?.mean_time_ms?.toFixed(2) || 'N/A'}
                          </TableCell>
                          <TableCell align="center">
                            {gpuResults[0]?.mean_time_ms && gpuResults[0]?.std_time_ms
                              ? `${gpuResults[0].mean_time_ms.toFixed(2)} ± ${gpuResults[0].std_time_ms.toFixed(2)}`
                              : gpuResults[0]?.mean_time_ms?.toFixed(2) || 'N/A'}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Min Time (ms)</TableCell>
                          <TableCell align="center">{cpuResults[0]?.min_time_ms?.toFixed(2) || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.min_time_ms?.toFixed(2) || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Max Time (ms)</TableCell>
                          <TableCell align="center">{cpuResults[0]?.max_time_ms?.toFixed(2) || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.max_time_ms?.toFixed(2) || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>FPS</TableCell>
                          <TableCell align="center">{cpuResults[0]?.fps?.toFixed(2) || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.fps?.toFixed(2) || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Num Runs</TableCell>
                          <TableCell align="center">{cpuResults[0]?.num_runs || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.num_runs || 'N/A'}</TableCell>
                        </TableRow>

                        {/* Memory Usage */}
                        <TableRow>
                          <TableCell>Baseline GPU Memory</TableCell>
                          <TableCell align="center">{cpuResults[0]?.baseline_gpu_memory_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.baseline_gpu_memory_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Baseline RAM Memory</TableCell>
                          <TableCell align="center">{cpuResults[0]?.baseline_ram_memory_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.baseline_ram_memory_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>GPU Memory Mean</TableCell>
                          <TableCell align="center">{cpuResults[0]?.gpu_memory_mean_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.gpu_memory_mean_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>GPU Memory Std</TableCell>
                          <TableCell align="center">{cpuResults[0]?.gpu_memory_std_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.gpu_memory_std_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>GPU Memory Max</TableCell>
                          <TableCell align="center">{cpuResults[0]?.gpu_memory_max_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.gpu_memory_max_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>RAM Memory Mean</TableCell>
                          <TableCell align="center">{cpuResults[0]?.ram_memory_mean_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.ram_memory_mean_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>RAM Memory Std</TableCell>
                          <TableCell align="center">{cpuResults[0]?.ram_memory_std_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.ram_memory_std_mb || 'N/A'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>RAM Memory Max</TableCell>
                          <TableCell align="center">{cpuResults[0]?.ram_memory_max_mb || 'N/A'}</TableCell>
                          <TableCell align="center">{gpuResults[0]?.ram_memory_max_mb || 'N/A'}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

    </Box>
  );
};

export default TrainingBenchmarksTab;