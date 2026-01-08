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
  alpha,
  useTheme,
  Button
} from '@mui/material';
import {
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { Code as CodeIcon } from '@mui/icons-material';
import { TrainingComparison } from '../../types';
import LatexModal from '../common/LatexModal';

interface TrainingClassIoUTableProps {
  comparisonData: TrainingComparison[];
}

interface ClassIoUData {
  className: string;
  trainingIoUs: { [trainingId: string]: { mean: number; std: number } | null };
}

const TrainingClassIoUTable: React.FC<TrainingClassIoUTableProps> = ({ comparisonData }) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('training');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  // Helper function to extract mean value from metric object
  const extractMeanValue = (metric: { mean: number; std: number } | null): number => {
    return metric ? metric.mean : -Infinity;
  };

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

  // Process class IoU data from validation results
  const classIoUData: ClassIoUData[] = React.useMemo(() => {
    const classMap: { [className: string]: { [trainingId: string]: number[] } } = {};

    comparisonData.forEach(comp => {
      const trainingId = comp.training._id;
      const epochs = comp.epochs;

      if (epochs.length === 0) return;

      // Sort epochs by validation IoU (descending) and take top 10
      const sortedEpochs = epochs
        .filter(epoch => epoch.results?.val?.mean_iou !== undefined)
        .sort((a, b) => (b.results?.val?.mean_iou ?? 0) - (a.results?.val?.mean_iou ?? 0))
        .slice(0, 10);

      if (sortedEpochs.length === 0) return;

      sortedEpochs.forEach(epoch => {
        const valResults = epoch.results?.val;
        if (valResults) {
          Object.keys(valResults).forEach(key => {
            if (key !== 'loss' && key !== 'mean_iou' && key !== 'val_loss') {
              const classData = valResults[key];
              if (classData && typeof classData === 'object' && typeof classData.iou === 'number') {
                if (!classMap[key]) {
                  classMap[key] = {};
                }
                if (!classMap[key][trainingId]) {
                  classMap[key][trainingId] = [];
                }
                classMap[key][trainingId].push(classData.iou);
              }
            }
          });
        }
      });
    });

    // Convert to ClassIoUData format with mean and std
    return Object.keys(classMap).map(className => {
      const trainingIoUs: { [trainingId: string]: { mean: number; std: number } | null } = {};

      comparisonData.forEach(comp => {
        const trainingId = comp.training._id;
        const iouValues = classMap[className][trainingId];

        if (iouValues && iouValues.length > 0) {
          const mean = iouValues.reduce((sum, val) => sum + val, 0) / iouValues.length;
          const variance = iouValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / iouValues.length;
          const std = Math.sqrt(variance);
          trainingIoUs[trainingId] = { mean, std };
        } else {
          trainingIoUs[trainingId] = null;
        }
      });

      return {
        className,
        trainingIoUs
      };
    }).sort((a, b) => a.className.localeCompare(b.className));
  }, [comparisonData]);

  // Sort comparison data based on selected column and direction
  const sortedComparisonData = React.useMemo(() => {
    return [...comparisonData].sort((a, b) => {
      let aValue: number = -Infinity;
      let bValue: number = -Infinity;
      let aString: string = '';
      let bString: string = '';

      if (sortColumn === 'training') {
        aString = a.training.name.toLowerCase();
        bString = b.training.name.toLowerCase();
      } else {
        // For class columns, find the IoU value for that class
        const classData = classIoUData.find(c => c.className === sortColumn);
        if (classData) {
          aValue = extractMeanValue(classData.trainingIoUs[a.training._id]);
          bValue = extractMeanValue(classData.trainingIoUs[b.training._id]);
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
  }, [comparisonData, sortColumn, sortDirection, classIoUData]);

  // Find best (highest) IoU values for each class
  const bestValues: { [className: string]: number } = React.useMemo(() => {
    const best: { [className: string]: number } = {};

    classIoUData.forEach(classData => {
      let maxIoU = -Infinity;
      Object.values(classData.trainingIoUs).forEach(iouData => {
        if (iouData && iouData.mean > maxIoU) {
          maxIoU = iouData.mean;
        }
      });
      if (maxIoU !== -Infinity) {
        best[classData.className] = maxIoU;
      }
    });

    return best;
  }, [classIoUData]);

  // Helper function to format mean ± std
  const formatMeanStd = (metric: { mean: number; std: number } | null, decimals: number = 3): string => {
    if (!metric) return 'N/A';
    return `${formatNumber(metric.mean, decimals)} ± ${formatNumber(metric.std, decimals)}`;
  };

  // Helper function to render cell with conditional bold styling
  const renderIoUCell = (
    iouData: { mean: number; std: number } | null,
    bestValue: number,
    decimals: number = 3
  ) => {
    const isBest = iouData && iouData.mean === bestValue;
    return (
      <Typography
        variant="body2"
        sx={{
          fontWeight: isBest ? 700 : 400,
          color: isBest ? 'black' : 'inherit'
        }}
      >
        {formatMeanStd(iouData, decimals)}
      </Typography>
    );
  };

  // Generate LaTeX for class IoU table
  const generateClassIoULatex = () => {
    if (classIoUData.length === 0) return '';

    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Training Validation IoU per Class (Top 10 Epochs by mIoU)}\n\\label{tab:class_iou}\n\\begin{tabular}{|l|${'c|'.repeat(classIoUData.length)}}\n\\hline\n`;

    // Header row
    latex += 'Training ';
    classIoUData.forEach(classData => {
      const className = classData.className.replace(/[&%$#_{}~^\\]/g, '\\$&');
      latex += `& ${className} `;
    });
    latex += '\\\\ \\hline\n';

    // Data rows - one per training
    comparisonData.forEach(comp => {
      const trainingName = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      latex += `${trainingName} `;

      classIoUData.forEach(classData => {
        const iouData = classData.trainingIoUs[comp.training._id];
        const bestValue = bestValues[classData.className];

        if (iouData) {
          const isBest = iouData.mean === bestValue;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${formatNumber(iouData.mean, 2)} ± ${formatNumber(iouData.std, 2)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }
      });

      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleGenerateLatex = () => {
    const latex = generateClassIoULatex();
    setLatexCode(latex);
    setLatexTitle('Training Class IoU LaTeX Code');
    setLatexModalOpen(true);
  };

  if (classIoUData.length === 0) {
    return (
      <Paper
        sx={{
          mb: 4,
          boxShadow: `0 4px 12px ${alpha(theme.palette.grey[500], 0.2)}`,
          bgcolor: alpha(theme.palette.grey[50], 0.5),
          border: `1px solid ${alpha(theme.palette.grey[300], 0.5)}`
        }}
      >
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Class IoU Data Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Per-class IoU metrics from training epochs will appear here once trainings have validation data with class-level metrics
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        mb: 4,
        boxShadow: `0 4px 12px ${alpha(theme.palette.grey[500], 0.2)}`,
        bgcolor: alpha(theme.palette.grey[50], 0.5),
        border: `1px solid ${alpha(theme.palette.grey[300], 0.5)}`
      }}
    >
      <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Training Validation IoU per Class
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Mean ± standard deviation from the top 10 epochs sorted by validation mean IoU. Best results are shown in bold.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CodeIcon />}
          onClick={handleGenerateLatex}
          disabled={classIoUData.length === 0}
        >
          LaTeX
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <SortableTableCell column="training" align="left">Training</SortableTableCell>
              {classIoUData.map(classData => (
                <SortableTableCell key={classData.className} column={classData.className}>
                  {classData.className}
                </SortableTableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedComparisonData.map((comp) => (
              <TableRow key={comp.training._id}>
                <TableCell>
                  <Link
                    to={`/trainings/${comp.training._id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'black' }}>
                      {comp.training.name}
                    </Typography>
                  </Link>
                </TableCell>
                {classIoUData.map(classData => {
                  const iouData = classData.trainingIoUs[comp.training._id];
                  const bestValue = bestValues[classData.className];

                  return (
                    <TableCell key={classData.className} align="center">
                      {renderIoUCell(iouData, bestValue, 4)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <LatexModal
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        title={latexTitle}
        code={latexCode}
      />
    </Paper>
  );
};

export default TrainingClassIoUTable;