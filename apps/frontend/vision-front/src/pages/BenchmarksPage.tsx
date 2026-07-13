import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Collapse,
  useTheme,
  alpha,
  Container
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
} from '@mui/icons-material';
import { Benchmark } from '@/types';
import { benchmarkService } from '@/services/benchmarkService';
import { useAuth } from '../contexts/AuthContext';

const BenchmarksPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [benchmarkToDelete, setBenchmarkToDelete] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading,
    refetch: loadBenchmarks
  } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: () =>
      benchmarkService.getBenchmarks({
        page: 1,
        limit: 100,
        sortBy: 'timestamp',
        order: 'desc'
      })
  });

  const benchmarks: Benchmark[] = data?.data.benchmarks || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => benchmarkService.deleteBenchmark(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benchmarks'] });
      setDeleteDialogOpen(false);
      setBenchmarkToDelete(null);
    },
    onError: (err) => {
      setError('Failed to delete benchmark');
      console.error('Error deleting benchmark:', err);
    }
  });

  const handleDeleteBenchmark = (id: string) => {
    setBenchmarkToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!benchmarkToDelete) return;
    deleteMutation.mutate(benchmarkToDelete);
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setBenchmarkToDelete(null);
  };

  const toggleRowExpanded = (benchmarkId: string) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(benchmarkId)) {
      newExpandedRows.delete(benchmarkId);
    } else {
      newExpandedRows.add(benchmarkId);
    }
    setExpandedRows(newExpandedRows);
  };

  const canDeleteBenchmarks = () => {
    if (!isAuthenticated || !user) return false;
    return user.groups?.some(group => group.includes('owner') || group.includes('admin')) ?? false;
  };

  const handleRowClick = (benchmark: Benchmark) => {
    if (benchmark.training_id && typeof benchmark.training_id === 'object' && '_id' in benchmark.training_id) {
      navigate(`/trainings/${benchmark.training_id._id}?tab=benchmarks`);
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

  if (loading && benchmarks.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "400px"
        }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4
        }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{
            fontWeight: 700
          }}>
            Benchmarks
          </Typography>
          <Typography variant="body1" sx={{
            color: "text.secondary"
          }}>
            Performance benchmarking results for model evaluation
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => {
                loadBenchmarks();
              }}
              sx={{ 
                bgcolor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                '&:hover': { bgcolor: theme.palette.action.hover }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {/* Benchmarks Table */}
      <TableContainer 
        component={Paper} 
        elevation={0} 
        sx={{ 
          borderRadius: 2, 
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'hidden'
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
              <TableCell sx={{ fontWeight: 600 }}></TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Training Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Mean FPS</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Parameters (M)</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>FLOPs (G)</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Mean Time (ms) GPU</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Mean Time (ms) CPU</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {benchmarks.map((benchmark) => {
              const isExpanded = expandedRows.has(benchmark._id);
              
              // Calculate aggregated metrics for the benchmark
              const totalModels = benchmark.results.length;
              const avgFps = benchmark.results.reduce((sum, result) => sum + (result.fps || 0), 0) / totalModels;
              
              const totalParams = benchmark.results.reduce((sum, result) => sum + (result.total_parameters || 0), 0) / totalModels;
              const totalParamsM = totalParams ? (totalParams / 1000000).toFixed(2) : 'N/A';

              const avgFlops = benchmark.results.reduce((sum, result) => sum + (result.flops_giga || 0), 0) / totalModels;
              const avgFlopsG = avgFlops > 0 ? avgFlops.toFixed(2) : 'N/A';

              // Calculate mean time for GPU and CPU separately
              const gpuResults = benchmark.results.filter(result => 
                result.device_type === 'cuda' || result.device?.toLowerCase().includes('gpu') || result.device?.toLowerCase().includes('cuda')
              );
              const cpuResults = benchmark.results.filter(result => 
                result.device_type === 'cpu' || result.device?.toLowerCase().includes('cpu')
              );

              const meanTimeGpu = gpuResults.length > 0 
                ? gpuResults.reduce((sum, result) => sum + (result.mean_time_ms || 0), 0) / gpuResults.length 
                : 0;
              const meanTimeCpu = cpuResults.length > 0 
                ? cpuResults.reduce((sum, result) => sum + (result.mean_time_ms || 0), 0) / cpuResults.length 
                : 0;

              // Calculate standard deviation for GPU and CPU times
              const stdTimeGpu = gpuResults.length > 0 
                ? gpuResults.reduce((sum, result) => sum + (result.std_time_ms || 0), 0) / gpuResults.length
                : 0;
              const stdTimeCpu = cpuResults.length > 0 
                ? cpuResults.reduce((sum, result) => sum + (result.std_time_ms || 0), 0) / cpuResults.length
                : 0;

              return (
                <React.Fragment key={benchmark._id}>
                  <TableRow 
                    key={benchmark._id}
                    onClick={() => handleRowClick(benchmark)}
                    sx={{ 
                      cursor: (benchmark.training_id && typeof benchmark.training_id === 'object' && '_id' in benchmark.training_id) ? 'pointer' : 'default',
                      '&:hover': { 
                        backgroundColor: (benchmark.training_id && typeof benchmark.training_id === 'object' && '_id' in benchmark.training_id) ? 'action.hover' : 'inherit' 
                      }
                    }}
                  >
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRowExpanded(benchmark._id);
                        }}
                      >
                        {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>{(benchmark.training_id && typeof benchmark.training_id === 'object' && 'name' in benchmark.training_id) ? benchmark.training_id.name : (benchmark.training_uuid ? 'Unknown Training' : 'Standalone')}</TableCell>
                    <TableCell>{avgFps.toFixed(2)}</TableCell>
                    <TableCell>{totalParamsM}</TableCell>
                    <TableCell>{avgFlopsG}</TableCell>
                    <TableCell>{meanTimeGpu > 0 ? `${meanTimeGpu.toFixed(2)} ± ${stdTimeGpu.toFixed(2)}` : 'N/A'}</TableCell>
                    <TableCell>{meanTimeCpu > 0 ? `${meanTimeCpu.toFixed(2)} ± ${stdTimeCpu.toFixed(2)}` : 'N/A'}</TableCell>
                    <TableCell>
                      {formatTimestamp(benchmark.timestamp)}
                    </TableCell>
                    <TableCell>
                      {canDeleteBenchmarks() && (
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBenchmark(benchmark._id);
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                          <Typography variant="h6" gutterBottom component="div">
                            Benchmark Results Details
                          </Typography>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Device</TableCell>
                                <TableCell>Framework</TableCell>
                                <TableCell>FPS</TableCell>
                                <TableCell>Mean Time (ms)</TableCell>
                                <TableCell>GPU Memory (GB)</TableCell>
                                <TableCell>CPU Memory (GB)</TableCell>
                                <TableCell>Image Size</TableCell>
                                <TableCell>FLOPs (G)</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {benchmark.results.map((result, resultIndex) => {
                                const fps = result.fps || 0;
                                const meanTime = result.mean_time_ms || (fps > 0 ? 1000 / fps : 0);
                                const stdTime = result.std_time_ms || 0;
                                const cpuMemory = (result.ram_memory_mean_mb || result.ram_memory_max_mb || result.baseline_ram_memory_mb || 0) / 1024;
                                const gpuMemory = (result.gpu_memory_mean_mb || result.gpu_memory_max_mb || result.baseline_gpu_memory_mb || 0) / 1024;
                                const imageSize = result.image_size || 'N/A';
                                const flopsG = result.flops_giga ? result.flops_giga.toFixed(2) : 'N/A';

                                return (
                                  <TableRow key={`${benchmark._id}-result-${resultIndex}`}>
                                    <TableCell>{result.device || 'N/A'}</TableCell>
                                    <TableCell>{result.backbone || 'N/A'}</TableCell>
                                    <TableCell>{fps.toFixed(2)}</TableCell>
                                    <TableCell>
                                      {meanTime > 0 ? `${meanTime.toFixed(2)} ± ${stdTime.toFixed(2)}` : 'N/A'}
                                    </TableCell>
                                    <TableCell>{gpuMemory.toFixed(2)}</TableCell>
                                    <TableCell>{cpuMemory.toFixed(2)}</TableCell>
                                    <TableCell>{imageSize}</TableCell>
                                    <TableCell>{flopsG}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {benchmarks.length === 0 && !loading && (
        <Box
          sx={{
            textAlign: "center",
            py: 6
          }}>
          <Typography variant="h6" color="textSecondary">
            No benchmarks found
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Benchmarks will appear here when available
          </Typography>
        </Box>
      )}
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCancelDelete}>
        <DialogTitle>Delete Benchmark</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this benchmark? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default BenchmarksPage;