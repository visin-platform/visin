import React from 'react';
import { Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Code as CodeIcon } from '@mui/icons-material';
import SortableTableCell from './SortableTableCell';

interface BenchmarkDeviceTableProps {
  device: 'gpu' | 'cpu';
  results: any[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onExportLatex: () => void;
}

const BenchmarkDeviceTable: React.FC<BenchmarkDeviceTableProps> = ({
  device,
  results,
  sortColumn,
  sortDirection,
  onSort,
  onExportLatex
}) => {
  const memoryColumn = device === 'gpu' ? 'gpu_memory' : 'ram_memory';
  const memoryLabel = device === 'gpu' ? 'GPU Memory (MB)' : 'RAM Memory (MB)';
  const memoryMeanKey = device === 'gpu' ? 'gpu_memory_mean_mb' : 'ram_memory_mean_mb';
  const memoryStdKey = device === 'gpu' ? 'gpu_memory_std_mb' : 'ram_memory_std_mb';
  const title = device === 'gpu' ? 'GPU Benchmarks Comparison' : 'CPU Benchmarks Comparison';

  const sorted = React.useMemo(() => {
    return [...results].sort((a, b) => {
      let aValue: number = -Infinity;
      let bValue: number = -Infinity;
      let aString = '';
      let bString = '';

      switch (sortColumn) {
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
        case memoryColumn:
          aValue = a[memoryMeanKey] ?? -Infinity;
          bValue = b[memoryMeanKey] ?? -Infinity;
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

      if (sortColumn === 'training_name') {
        const comparison = aString.localeCompare(bString);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      const comparison = aValue - bValue;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [results, sortColumn, sortDirection, memoryColumn, memoryMeanKey]);

  if (results.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h3" sx={{ fontWeight: "bold" }}>
          {title}
        </Typography>
        <Button variant="outlined" startIcon={<CodeIcon />} onClick={onExportLatex} size="small">
          LaTeX
        </Button>
      </Box>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <SortableTableCell column="training_name" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                Training
              </SortableTableCell>
              <SortableTableCell column="time" align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                Time (ms)
              </SortableTableCell>
              <SortableTableCell column="fps" align="right" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                FPS
              </SortableTableCell>
              <SortableTableCell column={memoryColumn} align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                {memoryLabel}
              </SortableTableCell>
              <SortableTableCell column="parameters" align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                Params (M)
              </SortableTableCell>
              <SortableTableCell column="flops" align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                FLOPs (G)
              </SortableTableCell>
              <SortableTableCell column="image_size" align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                Image Size
              </SortableTableCell>
              <SortableTableCell column="num_runs" align="center" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort}>
                Num Runs
              </SortableTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((result, index) => (
              <TableRow key={`${result.benchmark_id}-${index}`} hover>
                <TableCell>
                  <Typography variant="body2">{result.training_name}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">
                    {result.mean_time_ms && result.std_time_ms
                      ? `${result.mean_time_ms.toFixed(1)} ± ${result.std_time_ms.toFixed(1)}`
                      : result.mean_time_ms
                        ? result.mean_time_ms.toFixed(1)
                        : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{result.fps?.toFixed(2) || 'N/A'}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">
                    {result[memoryMeanKey] && result[memoryStdKey]
                      ? `${result[memoryMeanKey].toFixed(0)} ± ${result[memoryStdKey].toFixed(1)}`
                      : result[memoryMeanKey]
                        ? result[memoryMeanKey].toFixed(0)
                        : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">{result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A'}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">{result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A'}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">{result.image_size || 'N/A'}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">{result.num_runs || 'N/A'}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default BenchmarkDeviceTable;
