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
import { TrainingComparison } from '@/types';
import { formatTime, formatNumber } from '@/utils/comparisonLatexGenerator';
import { getBestEpoch, getBestValMeanIoU, getTop10ValMeanIoU, getTop10ValMeanIoUStats } from '@/utils/epochMetrics';
import LatexModal from '../common/LatexModal';

interface ComparisonTableProps {
  comparisonData: TrainingComparison[];
  decimals?: number;
  multiplier?: number;
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ 
  comparisonData,
  decimals = 2,
  multiplier = 100
}) => {
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('top10Avg');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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
          '&:hover': { bgcolor: 'action.hover' }
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
        case 'bestEpoch': {
          aValue = getBestEpoch(a)?.epoch ?? -Infinity;
          bValue = getBestEpoch(b)?.epoch ?? -Infinity;
          break;
        }
        case 'bestVmIoU': {
          aValue = getBestValMeanIoU(a);
          bValue = getBestValMeanIoU(b);
          break;
        }
        case 'top10Avg':
        default: {
          aValue = getTop10ValMeanIoU(a);
          bValue = getTop10ValMeanIoU(b);
          break;
        }
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
      const aAvg = getTop10ValMeanIoU(a);
      const bAvg = getTop10ValMeanIoU(b);
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
      const bestEpoch = getBestEpoch(comp);
      latex += `& ${bestEpoch ? bestEpoch.epoch : 'N/A'} `;
      
      // Best Validation mIoU
      const bestVmIoU = getBestValMeanIoU(comp);
      latex += `& ${bestVmIoU !== -Infinity ? formatNumber(bestVmIoU, decimals, multiplier) : 'N/A'} `;
      
      // Top 10 Validation mIoU Average
      const top10Stats = getTop10ValMeanIoUStats(comp);
      if (!top10Stats) {
        latex += '& N/A ';
      } else {
        latex += `& ${formatNumber(top10Stats.mean, decimals, multiplier)} ± ${formatNumber(top10Stats.std, decimals, multiplier)} `;
      }
      
      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleGenerateLatex = () => {
    const latex = generateDetailedComparisonLatex(2, 100);
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
              const bestEpoch = getBestEpoch(comp);

              // Calculate best validation mIoU
              const bestVmIoU = getBestValMeanIoU(comp);

              // Calculate top 10 validation mIoU average
              const top10Stats = getTop10ValMeanIoUStats(comp);
              const top10Avg = top10Stats
                ? `${formatNumber(top10Stats.mean, decimals, multiplier)} ± ${formatNumber(top10Stats.std, decimals, multiplier)}`
                : 'N/A';

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
      />
    </Paper>
  );
};

export default ComparisonTable;
