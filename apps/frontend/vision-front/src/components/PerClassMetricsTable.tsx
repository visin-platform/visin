import React from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { Epoch } from '../types';

interface PerClassMetricsTableProps {
  epochs: Epoch[];
}

export const PerClassMetricsTable: React.FC<PerClassMetricsTableProps> = ({ epochs }) => {
  const lastEpoch = epochs[epochs.length - 1];
  const classMetrics = lastEpoch?.results?.metrics?.per_class || {};

  if (Object.keys(classMetrics).length === 0) {
    return null;
  }

  return (
    <Paper>
      <Box sx={{
        p: 3
      }}>
        <Typography variant="h6" gutterBottom>
          Per-Class Metrics (Latest Epoch)
        </Typography>
      </Box>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Class</strong></TableCell>
              <TableCell align="right"><strong>IoU</strong></TableCell>
              <TableCell align="right"><strong>Precision</strong></TableCell>
              <TableCell align="right"><strong>Recall</strong></TableCell>
              <TableCell align="right"><strong>F1 Score</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(classMetrics).map(([className, metrics]: [string, any]) => (
              <TableRow key={className}>
                <TableCell>{className}</TableCell>
                <TableCell align="right">{metrics.iou?.toFixed(4) || '-'}</TableCell>
                <TableCell align="right">{metrics.precision?.toFixed(4) || '-'}</TableCell>
                <TableCell align="right">{metrics.recall?.toFixed(4) || '-'}</TableCell>
                <TableCell align="right">{metrics.f1?.toFixed(4) || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default PerClassMetricsTable;
