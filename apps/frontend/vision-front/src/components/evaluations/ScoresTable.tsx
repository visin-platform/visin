import React from 'react';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { EvaluationScores } from '../../types/evaluation';
import { formatFixed } from './verdict';

/** The scores a ranking uses: each condition, then the overall figure, for every metric the suite names. */
const ScoresTable: React.FC<{ scores: EvaluationScores }> = ({ scores }) => {
  const metrics = Object.keys(scores.overall);
  const rows: [string, Record<string, number>][] = [...Object.entries(scores.conditions), ['Overall', scores.overall]];
  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Table size="small" aria-label="Scores">
        <TableHead>
          <TableRow>
            <TableCell>Condition</TableCell>
            {metrics.map(metric => <TableCell key={metric} align="right" sx={{ textTransform: 'none' }}>{metric}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(([name, values]) => (
            <TableRow key={name} sx={name === 'Overall' ? { '& td, & th': { fontWeight: 600 } } : undefined}>
              <TableCell component="th" scope="row">{name}</TableCell>
              {metrics.map(metric => (
                <TableCell key={metric} align="right">{values[metric] === undefined ? '-' : formatFixed(values[metric])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ScoresTable;
