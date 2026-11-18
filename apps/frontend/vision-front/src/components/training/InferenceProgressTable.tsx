import React from 'react';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Typography } from '@mui/material';
import type { Epoch } from '../../types/epoch';
import { progressSeries, type ProgressUnit } from '../../utils/inferenceRun';
import { formatDateTime } from '../../utils/dateUtils';

const PAGE_SIZES = [50, 100, 250];

const format = (unit: ProgressUnit, value: number | null): string => {
  if (value === null) return '-';
  if (unit === 'rate') return `${(value * 100).toFixed(1)}%`;
  if (unit === 'ms') return `${Math.round(value).toLocaleString()} ms`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/**
 * An inference run's progress points as a table, a page at a time: the frames done, the frame that finished there,
 * when, and every value the run reported with it, in the units the charts use. The columns are read from the points,
 * so a run that reports other numbers shows those; a value a point did not report is a dash, never a zero.
 */
const InferenceProgressTable: React.FC<{ epochs: Epoch[] }> = ({ epochs }) => {
  const [page, setPage] = React.useState(0);
  const [limit, setLimit] = React.useState(PAGE_SIZES[0]);
  const { series } = React.useMemo(() => progressSeries(epochs), [epochs]);
  const points = React.useMemo(() => [...epochs].sort((a, b) => a.epoch - b.epoch), [epochs]);
  // progressSeries orders values by frames done, as `points` is, so a row's values are at its index.
  const shown = points.slice(page * limit, (page + 1) * limit);

  if (points.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No progress points yet.
      </Typography>
    );
  }

  return (
    <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <TableContainer tabIndex={0} role="region" aria-label="Progress points table">
        <Table size="small" aria-label="Progress points">
          <TableHead>
            <TableRow>
              <TableCell>Frames done</TableCell>
              <TableCell>Frame</TableCell>
              <TableCell>Finished</TableCell>
              {series.map((item) => (
                <TableCell key={item.id} align="right">
                  {item.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((point, offset) => {
              const index = page * limit + offset;
              const frame = typeof point.metadata?.frame === 'string' ? point.metadata.frame : '-';
              return (
                <TableRow key={point._id} hover>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{point.epoch.toLocaleString()}</TableCell>
                  <TableCell>{frame}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(point.timestamp)}</TableCell>
                  {series.map((item) => (
                    <TableCell key={item.id} align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {format(item.unit, item.data[index] ?? null)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={points.length}
        page={page}
        rowsPerPage={limit}
        rowsPerPageOptions={PAGE_SIZES}
        onPageChange={(_event, next) => setPage(next)}
        onRowsPerPageChange={(event) => {
          setLimit(Number(event.target.value));
          setPage(0);
        }}
      />
    </Paper>
  );
};

export default InferenceProgressTable;
