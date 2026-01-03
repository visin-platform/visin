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
  Chip,
  Button
} from '@mui/material';
import { Link } from 'react-router-dom';
import { Code as CodeIcon } from '@mui/icons-material';
import { TrainingComparison, ComparisonEpoch } from '@/types';
import { formatTime, formatNumber, getStatusColor } from '@/utils/comparisonLatexGenerator';
import LatexModal from '../common/LatexModal';

interface ComparisonTableProps {
  comparisonData: TrainingComparison[];
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ comparisonData }) => {
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');

  // Generate LaTeX for detailed comparison table
  const generateDetailedComparisonLatex = () => {
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
      latex += `& ${bestVmIoU !== -Infinity ? formatNumber(bestVmIoU) : 'N/A'} `;
      
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
        latex += `& ${formatNumber(mean)} ± ${formatNumber(std)} `;
      }
      
      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleGenerateLatex = () => {
    const latex = generateDetailedComparisonLatex();
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
              <TableCell><strong>Metric</strong></TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  <Link 
                    to={`/trainings/${comp.training._id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <strong>{comp.training.name}</strong>
                  </Link>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Status</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  <Chip
                    label={comp.training.status}
                    color={getStatusColor(comp.training.status)}
                    size="small"
                  />
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Total Epochs</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {comp.metrics.totalEpochs}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Total Training Time</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {formatTime(comp.metrics.totalTime)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Average Epoch Time</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {formatTime(comp.metrics.avgEpochTime)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Maximum Epoch Time</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {formatTime(comp.metrics.maxEpochTime)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>Best Epoch</TableCell>
              {comparisonData.map((comp) => {
                const bestEpoch = comp.epochs.reduce((best, epoch) => {
                  const currentVmIoU = epoch.results?.val?.mean_iou ?? -Infinity;
                  const bestVmIoU = best.results?.val?.mean_iou ?? -Infinity;
                  return currentVmIoU > bestVmIoU ? epoch : best;
                }, comp.epochs[0]);
                return (
                  <TableCell key={comp.training._id} align="center">
                    {bestEpoch ? bestEpoch.epoch : 'N/A'}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell>Best Validation mIoU</TableCell>
              {comparisonData.map((comp) => {
                const bestVmIoU = Math.max(...comp.epochs.map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou ?? -Infinity));
                return (
                  <TableCell key={comp.training._id} align="center">
                    {bestVmIoU !== -Infinity ? formatNumber(bestVmIoU) : 'N/A'}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell>Top 10 Validation mIoU Average</TableCell>
              {comparisonData.map((comp) => {
                const vmIoUs = comp.epochs
                  .map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou)
                  .filter((vmIoU: number | undefined) => vmIoU !== undefined)
                  .sort((a: number, b: number) => (b ?? 0) - (a ?? 0))
                  .slice(0, 10);
                
                if (vmIoUs.length === 0) {
                  return (
                    <TableCell key={comp.training._id} align="center">
                      N/A
                    </TableCell>
                  );
                }
                
                const mean = vmIoUs.reduce((sum: number, vmIoU: number) => sum + (vmIoU ?? 0), 0) / vmIoUs.length;
                const variance = vmIoUs.reduce((sum: number, vmIoU: number) => sum + Math.pow((vmIoU ?? 0) - mean, 2), 0) / vmIoUs.length;
                const std = Math.sqrt(variance);
                
                return (
                  <TableCell key={comp.training._id} align="center">
                    {formatNumber(mean)} ± {formatNumber(std)}
                  </TableCell>
                );
              })}
            </TableRow>
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
