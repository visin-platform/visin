import React from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { resultTable } from '../../utils/resultTable';
import { formatFixed } from './verdict';

/**
 * Every condition, class and metric the evaluator reported, discovered from the result itself, so no name is
 * expected. These are the evaluator's own figures: an `overall` here is what it wrote, which is not the ranked
 * overall Visin forms from the suite's declared conditions (shown above).
 */
const ResultsTable: React.FC<{ results: unknown }> = ({ results }) => {
  const { metrics, rows, omitted } = resultTable(results);
  if (rows.length === 0) {
    return <Typography variant="body2" color="text.secondary">The result holds no numbers to tabulate. The raw JSON is below.</Typography>;
  }
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        As the evaluator reported them. An “overall” here is the evaluator’s own figure, not the overall that is ranked, which Visin forms from the suite’s conditions.
      </Typography>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxHeight: 420 }}>
        <Table size="small" stickyHeader aria-label="Reported results">
          <TableHead>
            <TableRow>
              <TableCell>Condition</TableCell>
              <TableCell>Class</TableCell>
              {metrics.map(metric => <TableCell key={metric} align="right" sx={{ textTransform: 'none' }}>{metric}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={`${row.condition}/${row.scope}`}>
                <TableCell>{row.condition === 'overall' ? 'Whole test (as reported)' : row.condition}</TableCell>
                <TableCell>{row.scope === 'overall' && row.condition !== 'overall' ? 'overall (as reported)' : row.scope === 'overall' ? '' : row.scope}</TableCell>
                {metrics.map(metric => (
                  <TableCell key={metric} align="right">{row.values[metric] === undefined ? '-' : formatFixed(row.values[metric])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {omitted > 0 && <Typography variant="caption" color="text.secondary">{omitted} more rows are in the raw JSON.</Typography>}
    </Box>
  );
};

export default ResultsTable;
