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
import {
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Code as CodeIcon } from '@mui/icons-material';
import LatexCodeDialog from './LatexCodeDialog';

interface BenchmarksComparisonTableProps {
  benchmarks: any[];
}

const BenchmarksComparisonTable: React.FC<BenchmarksComparisonTableProps> = ({ benchmarks }) => {
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [gpuSortColumn, setGpuSortColumn] = useState<string>('training_name');
  const [gpuSortDirection, setGpuSortDirection] = useState<'asc' | 'desc'>('asc');
  const [cpuSortColumn, setCpuSortColumn] = useState<string>('training_name');
  const [cpuSortDirection, setCpuSortDirection] = useState<'asc' | 'desc'>('asc');

  // Handle sorting for GPU table
  const handleGpuSort = (column: string) => {
    if (gpuSortColumn === column) {
      setGpuSortDirection(gpuSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setGpuSortColumn(column);
      setGpuSortDirection('desc');
    }
  };

  // Handle sorting for CPU table
  const handleCpuSort = (column: string) => {
    if (cpuSortColumn === column) {
      setCpuSortDirection(cpuSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setCpuSortColumn(column);
      setCpuSortDirection('desc');
    }
  };

  // Helper component for sortable table headers
  const SortableTableCell = ({ 
    column, 
    children, 
    align = 'left',
    sortColumn,
    sortDirection,
    onSort
  }: { 
    column: string; 
    children: React.ReactNode; 
    align?: 'left' | 'center' | 'right';
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    onSort: (column: string) => void;
  }) => (
    <TableCell align={align}>
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' }
        }}
        onClick={() => onSort(column)}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
          {children}
        </Typography>
        {sortColumn === column && (
          sortDirection === 'asc' ? 
            <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : 
            <ArrowDownwardIcon sx={{ fontSize: 16 }} />
        )}
      </Box>
    </TableCell>
  );
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

  // Sort GPU results
  const sortedGpuResults = React.useMemo(() => {
    return [...gpuResults].sort((a, b) => {
      let aValue: number = -Infinity;
      let bValue: number = -Infinity;
      let aString: string = '';
      let bString: string = '';

      switch (gpuSortColumn) {
        case 'training_name':
          aString = a.training_name.toLowerCase();
          bString = b.training_name.toLowerCase();
          break;
        case 'time':
          aValue = a.mean_time_ms ?? -Infinity;
          bValue = b.mean_time_ms ?? -Infinity;
          break;
        case 'fps':
          aValue = a.fps ?? -Infinity;
          bValue = b.fps ?? -Infinity;
          break;
        case 'gpu_memory':
          aValue = a.gpu_memory_mean_mb ?? -Infinity;
          bValue = b.gpu_memory_mean_mb ?? -Infinity;
          break;
        case 'parameters':
          aValue = a.total_parameters_m ?? -Infinity;
          bValue = b.total_parameters_m ?? -Infinity;
          break;
        case 'flops':
          aValue = a.flops_giga ?? -Infinity;
          bValue = b.flops_giga ?? -Infinity;
          break;
        case 'image_size':
          aValue = a.image_size ?? -Infinity;
          bValue = b.image_size ?? -Infinity;
          break;
        case 'num_runs':
          aValue = a.num_runs ?? -Infinity;
          bValue = b.num_runs ?? -Infinity;
          break;
      }

      // Handle string comparison for training names
      if (gpuSortColumn === 'training_name') {
        const comparison = aString.localeCompare(bString);
        return gpuSortDirection === 'asc' ? comparison : -comparison;
      }

      // Handle numeric comparison
      const comparison = aValue - bValue;
      return gpuSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [gpuResults, gpuSortColumn, gpuSortDirection]);

  // Sort CPU results
  const sortedCpuResults = React.useMemo(() => {
    return [...cpuResults].sort((a, b) => {
      let aValue: number = -Infinity;
      let bValue: number = -Infinity;
      let aString: string = '';
      let bString: string = '';

      switch (cpuSortColumn) {
        case 'training_name':
          aString = a.training_name.toLowerCase();
          bString = b.training_name.toLowerCase();
          break;
        case 'time':
          aValue = a.mean_time_ms ?? -Infinity;
          bValue = b.mean_time_ms ?? -Infinity;
          break;
        case 'fps':
          aValue = a.fps ?? -Infinity;
          bValue = b.fps ?? -Infinity;
          break;
        case 'ram_memory':
          aValue = a.ram_memory_mean_mb ?? -Infinity;
          bValue = b.ram_memory_mean_mb ?? -Infinity;
          break;
        case 'parameters':
          aValue = a.total_parameters_m ?? -Infinity;
          bValue = b.total_parameters_m ?? -Infinity;
          break;
        case 'flops':
          aValue = a.flops_giga ?? -Infinity;
          bValue = b.flops_giga ?? -Infinity;
          break;
        case 'image_size':
          aValue = a.image_size ?? -Infinity;
          bValue = b.image_size ?? -Infinity;
          break;
        case 'num_runs':
          aValue = a.num_runs ?? -Infinity;
          bValue = b.num_runs ?? -Infinity;
          break;
      }

      // Handle string comparison for training names
      if (cpuSortColumn === 'training_name') {
        const comparison = aString.localeCompare(bString);
        return cpuSortDirection === 'asc' ? comparison : -comparison;
      }

      // Handle numeric comparison
      const comparison = aValue - bValue;
      return cpuSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [cpuResults, cpuSortColumn, cpuSortDirection]);

  // LaTeX generation functions
  const generateGpuLatex = () => {
    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{GPU Benchmark Performance Comparison}\n\\label{tab:gpu_benchmark_comparison}\n\\begin{tabular}{|l|c|c|c|c|c|c|c|c|}\n\\hline\nTraining & Time (ms) & FPS & GPU Memory (MB) & Params (M) & FLOPs (G) & Image Size & Num Runs \\\\\n\\hline\n`;

    gpuResults.forEach(result => {
      const trainingName = result.training_name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      const time = result.mean_time_ms && result.std_time_ms
        ? `${result.mean_time_ms.toFixed(1)} ± ${result.std_time_ms.toFixed(1)}`
        : result.mean_time_ms
          ? result.mean_time_ms.toFixed(1)
          : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const gpuMemory = result.gpu_memory_mean_mb && result.gpu_memory_std_mb
        ? `${result.gpu_memory_mean_mb.toFixed(0)} ± ${result.gpu_memory_std_mb.toFixed(1)}`
        : result.gpu_memory_mean_mb
          ? result.gpu_memory_mean_mb.toFixed(0)
          : 'N/A';
      const parameters = result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A';
      const flops = result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A';
      const imageSize = result.image_size || 'N/A';
      const numRuns = result.num_runs || 'N/A';

      latex += `${trainingName} & ${time} & ${fps} & ${gpuMemory} & ${parameters} & ${flops} & ${imageSize} & ${numRuns} \\\\\n`;
    });

    latex += `\\hline\n\\end{tabular}\n\\end{table*}\n`;
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  const generateCpuLatex = () => {
    let latex = `\\begin{table*}[ht]\n\\centering\n\\caption{CPU Benchmark Performance Comparison}\n\\label{tab:cpu_benchmark_comparison}\n\\begin{tabular}{|l|c|c|c|c|c|c|c|c|}\n\\hline\nTraining & Time (ms) & FPS & RAM Memory (MB) & Params (M) & FLOPs (G) & Image Size & Num Runs \\\\\n\\hline\n`;

    cpuResults.forEach(result => {
      const trainingName = result.training_name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      const time = result.mean_time_ms && result.std_time_ms
        ? `${result.mean_time_ms.toFixed(1)} ± ${result.std_time_ms.toFixed(1)}`
        : result.mean_time_ms
          ? result.mean_time_ms.toFixed(1)
          : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const ramMemory = result.ram_memory_mean_mb && result.ram_memory_std_mb
        ? `${result.ram_memory_mean_mb.toFixed(0)} ± ${result.ram_memory_std_mb.toFixed(1)}`
        : result.ram_memory_mean_mb
          ? result.ram_memory_mean_mb.toFixed(0)
          : 'N/A';
      const parameters = result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A';
      const flops = result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A';
      const imageSize = result.image_size || 'N/A';
      const numRuns = result.num_runs || 'N/A';

      latex += `${trainingName} & ${time} & ${fps} & ${ramMemory} & ${parameters} & ${flops} & ${imageSize} & ${numRuns} \\\\\n`;
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
                  <SortableTableCell 
                    column="training_name" 
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    Training
                  </SortableTableCell>
                  <SortableTableCell 
                    column="time" 
                    align="center"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    Time (ms)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="fps" 
                    align="right"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    FPS
                  </SortableTableCell>
                  <SortableTableCell 
                    column="gpu_memory" 
                    align="center"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    GPU Memory (MB)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="parameters" 
                    align="center"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    Params (M)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="flops" 
                    align="center"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    FLOPs (G)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="image_size" 
                    align="center"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    Image Size
                  </SortableTableCell>
                  <SortableTableCell 
                    column="num_runs" 
                    align="center"
                    sortColumn={gpuSortColumn} 
                    sortDirection={gpuSortDirection} 
                    onSort={handleGpuSort}
                  >
                    Num Runs
                  </SortableTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedGpuResults.map((result, index) => (
                  <TableRow key={`${result.benchmark_id}-${index}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {result.training_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.mean_time_ms && result.std_time_ms
                          ? `${result.mean_time_ms.toFixed(1)} ± ${result.std_time_ms.toFixed(1)}`
                          : result.mean_time_ms
                            ? result.mean_time_ms.toFixed(1)
                            : 'N/A'
                        }
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
                        {result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.image_size || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.num_runs || 'N/A'}
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
                  <SortableTableCell 
                    column="training_name" 
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    Training
                  </SortableTableCell>
                  <SortableTableCell 
                    column="time" 
                    align="center"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    Time (ms)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="fps" 
                    align="right"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    FPS
                  </SortableTableCell>
                  <SortableTableCell 
                    column="ram_memory" 
                    align="center"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    RAM Memory (MB)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="parameters" 
                    align="center"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    Params (M)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="flops" 
                    align="center"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    FLOPs (G)
                  </SortableTableCell>
                  <SortableTableCell 
                    column="image_size" 
                    align="center"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    Image Size
                  </SortableTableCell>
                  <SortableTableCell 
                    column="num_runs" 
                    align="center"
                    sortColumn={cpuSortColumn} 
                    sortDirection={cpuSortDirection} 
                    onSort={handleCpuSort}
                  >
                    Num Runs
                  </SortableTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedCpuResults.map((result, index) => (
                  <TableRow key={`${result.benchmark_id}-${index}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {result.training_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.mean_time_ms && result.std_time_ms
                          ? `${result.mean_time_ms.toFixed(1)} ± ${result.std_time_ms.toFixed(1)}`
                          : result.mean_time_ms
                            ? result.mean_time_ms.toFixed(1)
                            : 'N/A'
                        }
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
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.image_size || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.num_runs || 'N/A'}
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