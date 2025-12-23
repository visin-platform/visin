import React from 'react';
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
  Chip
} from '@mui/material';
import { Link } from 'react-router-dom';
import { TrainingComparison, ComparisonEpoch } from '@/types';
import { formatTime, formatNumber, getStatusColor } from '@/utils/comparisonLatexGenerator';

interface ComparisonTableProps {
  comparisonData: TrainingComparison[];
}

const ComparisonTable: React.FC<ComparisonTableProps> = ({ comparisonData }) => {
  return (
    <Paper sx={{ mb: 4 }}>
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Detailed Comparison
        </Typography>
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
              <TableCell>Total Cost (€)</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {comp.metrics.cost.totalCost.toFixed(2)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>CPU Cost (€)</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {comp.metrics.cost.cpuCost.toFixed(2)}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell>GPU Cost (€)</TableCell>
              {comparisonData.map((comp) => (
                <TableCell key={comp.training._id} align="center">
                  {comp.metrics.cost.gpuCost.toFixed(2)}
                </TableCell>
              ))}
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
              <TableCell>Top 5 Validation mIoU Average</TableCell>
              {comparisonData.map((comp) => {
                const vmIoUs = comp.epochs
                  .map((epoch: ComparisonEpoch) => epoch.results?.val?.mean_iou)
                  .filter((vmIoU: number | undefined) => vmIoU !== undefined)
                  .sort((a: number, b: number) => (b ?? 0) - (a ?? 0))
                  .slice(0, 5);
                const average = vmIoUs.length > 0 ? vmIoUs.reduce((sum: number, vmIoU: number) => sum + (vmIoU ?? 0), 0) / vmIoUs.length : undefined;
                return (
                  <TableCell key={comp.training._id} align="center">
                    {average !== undefined ? formatNumber(average) : 'N/A'}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default ComparisonTable;
