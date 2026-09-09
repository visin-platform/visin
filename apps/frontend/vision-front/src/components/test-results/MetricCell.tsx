import React from 'react';
import { TableCell, Typography } from '@mui/material';

interface MetricCellProps {
  value: number | undefined;
  format: (value: number) => string;
  /** renders bold — the best value in its column */
  best?: boolean;
  borderRight?: string;
}

/**
 * One metric value in a results table, or "N/A" where the run didn't report it.
 * Extracted because the five metric columns were five identical 20-line blocks,
 * which is what made adding a sixth metric a copy-paste job.
 */
const MetricCell: React.FC<MetricCellProps> = ({ value, format, best = false, borderRight }) => (
  <TableCell align="center" sx={borderRight ? { borderRight } : undefined}>
    {value !== undefined ? (
      <Typography
        variant="body2"
        sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap', fontWeight: best ? 'bold' : 'normal' }}
      >
        {format(value)}
      </Typography>
    ) : (
      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
        N/A
      </Typography>
    )}
  </TableCell>
);

export default MetricCell;
