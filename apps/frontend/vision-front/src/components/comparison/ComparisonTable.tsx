import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button
} from '@mui/material';
import {
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { Code as CodeIcon } from '@mui/icons-material';
import { TrainingComparison, ComparisonEpoch } from '@/types';
import { formatTime, formatNumber } from '@/utils/comparisonLatexGenerator';
import LatexModal from '../common/LatexModal';

interface ComparisonTableProps {
  comparisonData: TrainingComparison[];
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ comparisonData }) => {
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('top10Avg');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [decimals, setDecimals] = useState(2);
  const [multiplier, setMultiplier] = useState(100);

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Helper component for sortable table headers
  const SortableTableCell = ({ 
    column, 
    children, 
    align = 'center' 
  }: { 
    column: string; 
    children: React.ReactNode; 
    align?: 'left' | 'center' | 'right' 
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
        onClick={() => handleSort(column)}
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
  // Sort trainings based on selected column and direction
  const sortedComparisonData = React.useMemo(() => {
    return [...comparisonData].sort((a, b) => {
      let aValue: number = -Infinity;
      let bValue: number = -Infinity;
      let aString: string = '';
      let bString: string = '';

      switch (sortColumn) {
        case 'training':
          aString = a.training.name.toLowerCase();
          bString = b.training.name.toLowerCase();
          break;
        case 'totalTime':
          aValue = a.metrics.totalTime;
          bValue = b.metrics.totalTime;
          break;
        case 'avgEpochTime':
          aValue = a.metrics.avgEpochTime;
          bValue = b.metrics.avgEpochTime;
          break;
        case 'bestEpoch':
          const aBestEpoch = a.epochs.reduce((best, epoch) => {
            const currentVmIoU = epoch.results?.val?.mean_iou ?? -Infinity;
            const bestVmIoU = best.results?.val?.mean_iou ?? -Infinity;
            return currentVmIoU > bestVmIoU ? epoch : best;
          }, a.epochs[0]);
          const bBestEpoch = b.epochs.reduce((best, epoch) => {
            const currentVmIoU = epoch.results?.val?.mean_iou ?? -Infinity;
            const bestVmIoU = best.results?.val?.mean_iou ?? -Infinity;
            return currentVmIoU > bestVmIoU ? epoch : best;
          }, b.epochs[0]);
          aValue = aBestEpoch ? aBestEpoch.epoch : -Infinity;
          bValue = bBestEpoch ? bBestEpoch.epoch : -Infinity;
          break;
        case 'bestVmIoU':
          const aBestVmIoU = Math.max(...a.epochs.map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou ?? -Infinity));
          const bBestVmIoU = Math.max(...b.epochs.map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou ?? -Infinity));
          aValue = aBestVmIoU;
          bValue = bBestVmIoU;
          break;
        case 'top10Avg':
        default:
          const getTop10Avg = (comp: TrainingComparison) => {
            const vmIoUs = comp.epochs
              .map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou)
              .filter((vmIoU: number | undefined) => vmIoU !== undefined)
              .sort((a: number, b: number) => (b ?? 0) - (a ?? 0))
              .slice(0, 10);

            if (vmIoUs.length === 0) return -Infinity;
            return vmIoUs.reduce((sum: number, vmIoU: number) => sum + (vmIoU ?? 0), 0) / vmIoUs.length;
          };
          aValue = getTop10Avg(a);
          bValue = getTop10Avg(b);
          break;
      }

      // Handle string comparison for training names
      if (sortColumn === 'training') {
        const comparison = aString.localeCompare(bString);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Handle numeric comparison
      const comparison = aValue - bValue;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [comparisonData, sortColumn, sortDirection]);
  const generateDetailedComparisonLatex = (decimals: number = 2, multiplier: number = 100) => {
    // Sort trainings by top 10 validation mIoU average (descending)
    const sortedData = [...comparisonData].sort((a, b) => {
      const getTop10Avg = (comp: any) => {
        const vmIoUs = comp.epochs
          .map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou)
          .filter((vmIoU: number | undefined) => vmIoU !== undefined)
          .sort((a: number, b: number) => (b ?? 0) - (a ?? 0))
          .slice(0, 10);
        
        if (vmIoUs.length === 0) return -Infinity;
        return vmIoUs.reduce((sum: number, vmIoU: number) => sum + (vmIoU ?? 0), 0) / vmIoUs.length;
      };
      
      const aAvg = getTop10Avg(a);
      const bAvg = getTop10Avg(b);
      return bAvg - aAvg; // Descending order
    });

    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Detailed Training Comparison}\n\\label{tab:detailed_comparison}\n\\begin{tabular}{|l|c|c|c|c|c|}\n\\hline\n`;

    // Header row with metrics
    latex += 'Training & Total Time & Avg Epoch Time & Best Epoch & Best Val mIoU & Top 10 Val mIoU Avg \\\\\n\\hline\n';

    // Data rows - one per training
    sortedData.forEach(comp => {
      const trainingName = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      
      // Training name
      latex += `${trainingName} `;
      
      // Total Training Time
      latex += `& ${formatTime(comp.metrics.totalTime)} `;
      
      // Average Epoch Time
      latex += `& ${formatTime(comp.metrics.avgEpochTime)} `;
      
      // Best Epoch
      const bestEpoch = comp.epochs.reduce((best, epoch) => {
        const currentVmIoU = epoch.results?.val?.mean_iou ?? -Infinity;
        const bestVmIoU = best.results?.val?.mean_iou ?? -Infinity;
        return currentVmIoU > bestVmIoU ? epoch : best;
      }, comp.epochs[0]);
      latex += `& ${bestEpoch ? bestEpoch.epoch : 'N/A'} `;
      
      // Best Validation mIoU
      const bestVmIoU = Math.max(...comp.epochs.map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou ?? -Infinity));
      latex += `& ${bestVmIoU !== -Infinity ? formatNumber(bestVmIoU, decimals, multiplier) : 'N/A'} `;
      
      // Top 10 Validation mIoU Average
      const vmIoUs = comp.epochs
        .map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou)
        .filter((vmIoU: number | undefined) => vmIoU !== undefined)
        .sort((a: number, b: number) => (b ?? 0) - (a ?? 0))
        .slice(0, 10);
      
      if (vmIoUs.length === 0) {
        latex += '& N/A ';
      } else {
        const mean = vmIoUs.reduce((sum: number, vmIoU: number) => sum + (vmIoU ?? 0), 0) / vmIoUs.length;
        const variance = vmIoUs.reduce((sum: number, vmIoU: number) => sum + Math.pow((vmIoU ?? 0) - mean, 2), 0) / vmIoUs.length;
        const std = Math.sqrt(variance);
        latex += `& ${formatNumber(mean, decimals, multiplier)} ± ${formatNumber(std, decimals, multiplier)} `;
      }
      
      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleDecimalsChange = (newDecimals: number) => {
    setDecimals(newDecimals);
    if (latexModalOpen) {
      const latex = generateDetailedComparisonLatex(newDecimals, multiplier);
      setLatexCode(latex);
    }
  };

  const handleMultiplierChange = (newMultiplier: number) => {
    setMultiplier(newMultiplier);
    if (latexModalOpen) {
      const latex = generateDetailedComparisonLatex(decimals, newMultiplier);
      setLatexCode(latex);
    }
  };

  const handleGenerateLatex = () => {
    const latex = generateDetailedComparisonLatex(decimals, multiplier);
    setLatexCode(latex);
    setLatexTitle('Detailed Comparison LaTeX Code');
    setLatexModalOpen(true);
  };

  return (
    <Paper sx={{ mb: 4 }}>
      <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Detailed Comparison
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CodeIcon />}
          onClick={handleGenerateLatex}
          disabled={comparisonData.length === 0}
        >
          LaTeX
        </Button>
      </Box>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <SortableTableCell column="training" align="left">Training</SortableTableCell>
              <SortableTableCell column="totalTime">Total Time</SortableTableCell>
              <SortableTableCell column="avgEpochTime">Avg Epoch Time</SortableTableCell>
              <SortableTableCell column="bestEpoch">Best Epoch</SortableTableCell>
              <SortableTableCell column="bestVmIoU">Best Val mIoU</SortableTableCell>
              <SortableTableCell column="top10Avg">Top 10 Val mIoU Avg</SortableTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedComparisonData.map((comp) => {
              // Calculate best epoch
              const bestEpoch = comp.epochs.reduce((best, epoch) => {
                const currentVmIoU = epoch.results?.val?.mean_iou ?? -Infinity;
                const bestVmIoU = best.results?.val?.mean_iou ?? -Infinity;
                return currentVmIoU > bestVmIoU ? epoch : best;
              }, comp.epochs[0]);

              // Calculate best validation mIoU
              const bestVmIoU = Math.max(...comp.epochs.map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou ?? -Infinity));

              // Calculate top 10 validation mIoU average
              const vmIoUs = comp.epochs
                .map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou)
                .filter((vmIoU: number | undefined) => vmIoU !== undefined)
                .sort((a: number, b: number) => (b ?? 0) - (a ?? 0))
                .slice(0, 10);
              
              let top10Avg = 'N/A';
              if (vmIoUs.length > 0) {
                const mean = vmIoUs.reduce((sum: number, vmIoU: number) => sum + (vmIoU ?? 0), 0) / vmIoUs.length;
                const variance = vmIoUs.reduce((sum: number, vmIoU: number) => sum + Math.pow((vmIoU ?? 0) - mean, 2), 0) / vmIoUs.length;
                const std = Math.sqrt(variance);
                top10Avg = `${formatNumber(mean, decimals, multiplier)} ± ${formatNumber(std, decimals, multiplier)}`;
              }

              return (
                <TableRow key={comp.training._id}>
                  <TableCell>
                    <Link 
                      to={`/trainings/${comp.training._id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {comp.training.name}
                      </Typography>
                    </Link>
                  </TableCell>
                  <TableCell align="center">
                    {formatTime(comp.metrics.totalTime)}
                  </TableCell>
                  <TableCell align="center">
                    {formatTime(comp.metrics.avgEpochTime)}
                  </TableCell>
                  <TableCell align="center">
                    {bestEpoch ? bestEpoch.epoch : 'N/A'}
                  </TableCell>
                  <TableCell align="center">
                    {bestVmIoU !== -Infinity ? formatNumber(bestVmIoU, decimals, multiplier) : 'N/A'}
                  </TableCell>
                  <TableCell align="center">
                    {top10Avg}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* LaTeX Modal */}
      <LatexModal
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        title={latexTitle}
        code={latexCode}
        decimals={decimals}
        multiplier={multiplier}
        onDecimalsChange={handleDecimalsChange}
        onMultiplierChange={handleMultiplierChange}
      />
    </Paper>
  );
};

export default ComparisonTable;
