import React, { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Link,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Scoreboard as EvaluationIcon } from '@mui/icons-material';
import { Chip } from '@mui/material';
import { EmptyState, useCompactLayout } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { MobileListRow } from '../common/MobileList';
import { evaluationService } from '../../services/evaluationService';
import type { Evaluation, EvaluationQuery, ValidationState } from '../../types/evaluation';
import { formatDate } from '../../utils';
import VerdictChip from './VerdictChip';
import { checkpointLabel, STATE_META } from './verdict';

interface EvaluationListProps {
  /** Only this project's evaluations; without it, every project the caller can read. */
  projectId?: string;
  /** Only this suite version, as `slug@version`. */
  suite?: string;
  title?: string;
}

const PAGE_SIZES = [10, 30, 100];
const suiteLabel = (evaluation: Evaluation) => (evaluation.suite ? `${evaluation.suite.slug}@${evaluation.suite.version}` : undefined);

/** The verdict, and a mark when a manager put the result on the public leaderboard. */
const VerdictLabels: React.FC<{ row: Evaluation }> = ({ row }) => (
  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
    <VerdictChip validation={row.validation} />
    {row.publishedAt && <Chip size="small" variant="outlined" label="Public" />}
  </Box>
);

/**
 * Every evaluation the caller may read, newest first, each with whether it can be ranked. The page to open to
 * see what was run and why a result is, or is not, on a leaderboard.
 */
const EvaluationList: React.FC<EvaluationListProps> = ({ projectId, suite, title }) => {
  const compact = useCompactLayout();
  const [state, setState] = useState<ValidationState | ''>('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(30);
  const query: EvaluationQuery = {
    ...(projectId ? { projectId } : {}),
    ...(suite ? { suite } : {}),
    ...(state ? { state } : {}),
    page: page + 1,
    limit
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evaluations', query],
    queryFn: () => evaluationService.list(query),
    placeholderData: previous => previous
  });
  const rows = data?.evaluations ?? [];

  let content: React.ReactNode;
  if (isLoading) {
    content = <CircularProgress />;
  } else if (isError) {
    content = <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load evaluations'}</Alert>;
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon={<EvaluationIcon />}
        title={state ? 'No evaluations in this state' : 'No evaluations yet'}
        description={
          state
            ? 'Try another state.'
            : 'An evaluation is one checkpoint scored on a suite. Publish a suite, then record results on it from your evaluation script, or promote an older test result.'
        }
      />
    );
  } else if (compact) {
    content = (
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {rows.map(row => (
          <MobileListRow
            key={row._id}
            to={`/evaluations/${row._id}`}
            title={checkpointLabel(row.checkpoint)}
            meta={<VerdictLabels row={row} />}
            figures={[
              { label: 'Suite', value: suiteLabel(row) ?? '-' },
              { label: 'Recorded', value: formatDate(row.receivedAt) }
            ]}
          />
        ))}
      </Paper>
    );
  } else {
    content = (
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Checkpoint</TableCell>
              <TableCell>Suite</TableCell>
              <TableCell>Verdict</TableCell>
              <TableCell>Recorded</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row._id} hover>
                <TableCell>
                  <Link component={RouterLink} to={`/evaluations/${row._id}`}>{checkpointLabel(row.checkpoint)}</Link>
                  {row.status === 'failed' && (
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>Run failed</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {row.suite ? (
                    <Link component={RouterLink} to={`/suites/${row.suite.slug}/${row.suite.version}`}>{suiteLabel(row)}</Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell><VerdictLabels row={row} /></TableCell>
                <TableCell>{formatDate(row.receivedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Box>
      {title && <Typography variant="h6" gutterBottom>{title}</Typography>}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          select
          size="small"
          label="Verdict"
          value={state}
          onChange={event => { setState(event.target.value as ValidationState | ''); setPage(0); }}
          sx={{ flex: '0 1 220px' }}
        >
          <MenuItem value="">All</MenuItem>
          {(Object.keys(STATE_META) as ValidationState[]).map(key => (
            <MenuItem key={key} value={key}>{STATE_META[key].label}</MenuItem>
          ))}
        </TextField>
      </Box>
      {content}
      {data && data.pagination.total > PAGE_SIZES[0] && (
        <TablePagination
          component="div"
          count={data.pagination.total}
          page={page}
          rowsPerPage={limit}
          rowsPerPageOptions={PAGE_SIZES}
          onPageChange={(_event, next) => setPage(next)}
          onRowsPerPageChange={event => { setLimit(Number(event.target.value)); setPage(0); }}
        />
      )}
    </Box>
  );
};

export default EvaluationList;
