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
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import { Epoch, EpochMetrics } from '../types';

interface PerClassMetricsTableProps {
  epochs: Epoch[];
  title?: string;
  description?: string;
  headerIcon?: React.ReactNode;
  variant?: 'paper' | 'inline';
  size?: 'small' | 'medium';
  highlightHeader?: boolean;
  hoverRows?: boolean;
  monospaceValues?: boolean;
}

export const PerClassMetricsTable: React.FC<PerClassMetricsTableProps> = ({
  epochs,
  title = 'Per-Class Metrics (Latest Epoch)',
  description,
  headerIcon,
  variant = 'paper',
  size = 'medium',
  highlightHeader = false,
  hoverRows = false,
  monospaceValues = false
}) => {
  const theme = useTheme();
  const lastEpoch = epochs[epochs.length - 1];
  const classMetrics = lastEpoch?.results?.metrics?.per_class || {};

  if (Object.keys(classMetrics).length === 0) {
    return null;
  }

  const heading = (
    <Box sx={{ p: variant === 'paper' ? 3 : 0, mb: variant === 'paper' ? 0 : 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: description ? 1 : 0 }}>
        {headerIcon}
        <Typography
          variant="h6"
          gutterBottom={variant === 'paper' && !description}
          sx={{ fontSize: variant === 'inline' ? '1rem' : undefined, fontWeight: variant === 'inline' ? 600 : undefined }}
        >
          {title}
        </Typography>
      </Box>
      {description && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {description}
        </Typography>
      )}
    </Box>
  );

  const tableContent = (
      <Table size={size}>
        <TableHead sx={highlightHeader ? { bgcolor: alpha(theme.palette.primary.main, 0.05) } : undefined}>
          <TableRow>
            <TableCell><strong>Class</strong></TableCell>
            <TableCell align="right"><strong>IoU</strong></TableCell>
            <TableCell align="right"><strong>Precision</strong></TableCell>
            <TableCell align="right"><strong>Recall</strong></TableCell>
            <TableCell align="right"><strong>F1 Score</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(classMetrics).map(([className, metrics]: [string, EpochMetrics]) => (
            <TableRow key={className} hover={hoverRows}>
              <TableCell component="th" scope="row" sx={{ fontWeight: variant === 'inline' ? 500 : undefined }}>
                {className}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: monospaceValues ? 'monospace' : undefined }}>
                {metrics.iou?.toFixed(4) || '-'}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: monospaceValues ? 'monospace' : undefined }}>
                {metrics.precision?.toFixed(4) || '-'}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: monospaceValues ? 'monospace' : undefined }}>
                {metrics.recall?.toFixed(4) || '-'}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: monospaceValues ? 'monospace' : undefined }}>
                {metrics.f1?.toFixed(4) || '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
  );

  const table = variant === 'inline' ? (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
      {tableContent}
    </TableContainer>
  ) : (
    <TableContainer sx={{ borderRadius: 1 }}>
      {tableContent}
    </TableContainer>
  );

  if (variant === 'inline') {
    return (
      <>
        {heading}
        {table}
      </>
    );
  }

  return (
    <Paper>
      {heading}
      {table}
    </Paper>
  );
};

export default PerClassMetricsTable;
