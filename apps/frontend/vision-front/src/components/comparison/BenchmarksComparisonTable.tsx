import React from 'react';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';

interface BenchmarksComparisonTableProps {
  benchmarks: any[];
}

const BenchmarksComparisonTable: React.FC<BenchmarksComparisonTableProps> = ({ benchmarks }) => {
  if (benchmarks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No benchmarks available for comparison
        </Typography>
      </Box>
    );
  }

  // Separate CPU and GPU results
  const cpuResults = benchmarks.filter(b => 
    b.results && b.results.some((r: any) => r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu'))
  ).flatMap(b => 
    b.results.filter((r: any) => r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu'))
      .map((r: any) => ({ ...r, training_name: b.training_name || 'Unknown', benchmark_id: b._id }))
  );

  const gpuResults = benchmarks.filter(b => 
    b.results && b.results.some((r: any) => r.device_type === 'gpu' || r.device?.toLowerCase().includes('gpu') || (!r.device_type && !r.device))
  ).flatMap(b => 
    b.results.filter((r: any) => r.device_type === 'gpu' || r.device?.toLowerCase().includes('gpu') || (!r.device_type && !r.device))
      .map((r: any) => ({ ...r, training_name: b.training_name || 'Unknown', benchmark_id: b._id }))
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* GPU Results Table */}
      {gpuResults.length > 0 && (
        <Box>
          <Typography variant="h6" component="h3" gutterBottom fontWeight="bold" sx={{ mb: 2 }}>
            GPU Benchmarks Comparison
          </Typography>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Training</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Mean Time (ms)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>FPS</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>GPU Memory (MB)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>RAM Memory (MB)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {gpuResults.map((result, index) => (
                  <TableRow key={`${result.benchmark_id}-${index}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {result.training_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {result.fps?.toFixed(2) || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.gpu_memory_mean_mb && result.gpu_memory_std_mb
                          ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
                          : result.gpu_memory_mean_mb
                            ? result.gpu_memory_mean_mb.toFixed(0)
                            : 'N/A'
                        }
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.ram_memory_mean_mb && result.ram_memory_std_mb
                          ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
                          : result.ram_memory_mean_mb
                            ? result.ram_memory_mean_mb.toFixed(0)
                            : 'N/A'
                        }
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* CPU Results Table */}
      {cpuResults.length > 0 && (
        <Box>
          <Typography variant="h6" component="h3" gutterBottom fontWeight="bold" sx={{ mb: 2 }}>
            CPU Benchmarks Comparison
          </Typography>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Training</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Mean Time (ms)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>FPS</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>GPU Memory (MB)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>RAM Memory (MB)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cpuResults.map((result, index) => (
                  <TableRow key={`${result.benchmark_id}-${index}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {result.training_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {result.fps?.toFixed(2) || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.gpu_memory_mean_mb && result.gpu_memory_std_mb
                          ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
                          : result.gpu_memory_mean_mb
                            ? result.gpu_memory_mean_mb.toFixed(0)
                            : 'N/A'
                        }
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.ram_memory_mean_mb && result.ram_memory_std_mb
                          ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
                          : result.ram_memory_mean_mb
                            ? result.ram_memory_mean_mb.toFixed(0)
                            : 'N/A'
                        }
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {cpuResults.length === 0 && gpuResults.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No benchmark results found for comparison
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default BenchmarksComparisonTable;