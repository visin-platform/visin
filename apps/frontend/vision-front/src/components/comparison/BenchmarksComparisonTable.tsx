import React, { useState } from 'react';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button
} from '@mui/material';
import { Code as CodeIcon } from '@mui/icons-material';
import LatexCodeDialog from './LatexCodeDialog';

interface BenchmarksComparisonTableProps {
  benchmarks: any[];
}

const BenchmarksComparisonTable: React.FC<BenchmarksComparisonTableProps> = ({ benchmarks }) => {
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
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
    b.results && b.results.some((r: any) => r.device_type === 'gpu' || r.device_type === 'cuda' || r.device?.toLowerCase().includes('gpu') || (!r.device_type && !r.device))
  ).flatMap(b => 
    b.results.filter((r: any) => r.device_type === 'gpu' || r.device_type === 'cuda' || r.device?.toLowerCase().includes('gpu') || (!r.device_type && !r.device))
      .map((r: any) => ({ ...r, training_name: b.training_name || 'Unknown', benchmark_id: b._id }))
  );

  // LaTeX generation functions
  const generateGpuLatex = () => {
    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{GPU Benchmark Performance Comparison}\n\\label{tab:gpu_benchmark_comparison}\n\\begin{tabular}{|l|c|c|c|c|}\n\\hline\nTraining & Mean Time (ms) & FPS & GPU Memory (MB) & RAM Memory (MB) \\\\\n\\hline\n`;

    gpuResults.forEach(result => {
      const trainingName = result.training_name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      const meanTime = result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const gpuMemory = result.gpu_memory_mean_mb && result.gpu_memory_std_mb
        ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
        : result.gpu_memory_mean_mb
          ? result.gpu_memory_mean_mb.toFixed(0)
          : 'N/A';
      const ramMemory = result.ram_memory_mean_mb && result.ram_memory_std_mb
        ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
        : result.ram_memory_mean_mb
          ? result.ram_memory_mean_mb.toFixed(0)
          : 'N/A';

      latex += `${trainingName} & ${meanTime} & ${fps} & ${gpuMemory} & ${ramMemory} \\\\\n`;
    });

    latex += `\\hline\n\\end{tabular}\n\\end{table*}\n`;
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  const generateCpuLatex = () => {
    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{CPU Benchmark Performance Comparison}\n\\label{tab:cpu_benchmark_comparison}\n\\begin{tabular}{|l|c|c|c|}\n\\hline\nTraining & Mean Time (ms) & FPS & RAM Memory (MB) \\\\\n\\hline\n`;

    cpuResults.forEach(result => {
      const trainingName = result.training_name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      const meanTime = result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const ramMemory = result.ram_memory_mean_mb && result.ram_memory_std_mb
        ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
        : result.ram_memory_mean_mb
          ? result.ram_memory_mean_mb.toFixed(0)
          : 'N/A';

      latex += `${trainingName} & ${meanTime} & ${fps} & ${ramMemory} \\\\\n`;
    });

    latex += `\\hline\n\\end{tabular}\n\\end{table*}\n`;
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* GPU Results Table */}
      {gpuResults.length > 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h3" fontWeight="bold">
              GPU Benchmarks Comparison
            </Typography>
            <Button
              variant="outlined"
              startIcon={<CodeIcon />}
              onClick={generateGpuLatex}
              size="small"
            >
              LaTeX
            </Button>
          </Box>
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h3" fontWeight="bold">
              CPU Benchmarks Comparison
            </Typography>
            <Button
              variant="outlined"
              startIcon={<CodeIcon />}
              onClick={generateCpuLatex}
              size="small"
            >
              LaTeX
            </Button>
          </Box>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Training</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Mean Time (ms)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>FPS</TableCell>
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

      {/* LaTeX Modal */}
      <LatexCodeDialog
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        latexCode={latexCode}
        copyToClipboard={(text) => navigator.clipboard.writeText(text)}
      />
    </Box>
  );
};

export default BenchmarksComparisonTable;