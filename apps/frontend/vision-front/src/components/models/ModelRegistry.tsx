import React, { useEffect, useState } from 'react';
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
import { Memory as ModelIcon } from '@mui/icons-material';
import { EmptyState, useCompactLayout } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import ModelTryDialog from './ModelTryDialog';
import { MobileListRow } from '../common/MobileList';
import { modelService } from '../../services/modelService';
import type { RegistryEvaluation, RegistryModel, RegistryQuery } from '../../types/modelRegistry';
import { formatDate } from '../../utils';
import { hubModelUrl, hubSpaceUrl, shortRevision } from '../../utils/hubLinks';

interface ModelRegistryProps {
  /** Only this project's models; without it, every project the caller can see. */
  projectId?: string;
  /** Shown above the list, when the page around it does not already say what this is. */
  title?: string;
}

const PAGE_SIZES = [10, 30, 100];

const formatReading = (reading: { value: number; epoch: number }): string =>
  `${Number(reading.value.toPrecision(4))} (epoch ${reading.epoch})`;

/**
 * The score a row is ranked by, and what it is a score of. A link that names its epoch is
 * scored by that epoch alone; one that does not can only be scored by where its run peaked.
 */
const scoreOf = (row: RegistryModel): { text: string; note?: string } => {
  if (row.model.epoch === undefined) {
    return row.best ? { text: formatReading(row.best), note: 'run best' } : { text: '-' };
  }
  const peak = row.best && row.best.epoch !== row.model.epoch ? `run best ${formatReading(row.best)}` : undefined;
  if (row.checkpoint) return { text: formatReading(row.checkpoint), note: peak ? `this checkpoint · ${peak}` : 'this checkpoint' };
  return { text: '-', note: [`epoch ${row.model.epoch} reported no value`, peak].filter(Boolean).join(' · ') };
};

const formatBest = (row: RegistryModel): string => {
  const { text, note } = scoreOf(row);
  return note ? `${text}, ${note}` : text;
};

/** A checkpoint's score on a suite, in a line: `road-test@1 mIoU 0.7351`. */
const evaluationText = (evaluation: RegistryEvaluation): string =>
  `${evaluation.suite.slug}@${evaluation.suite.version} ${evaluation.headline.key} ${Number(evaluation.headline.value.toPrecision(4))}`;

const datasetName = (row: RegistryModel): string => row.training.dataset?.name ?? row.training.datasetId ?? '-';

/** Waits for typing to pause, so each keystroke is not a request. */
const useDebounced = (value: string, delay = 300): string => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
};

/**
 * Every Hub model linked to a run, newest first, or ranked by a result you name: the
 * epoch a checkpoint was saved at when the link says which, else how well its run did. The page a researcher opens to answer "which model
 * should I use?". Whether larger is better for a result is not known to Visin, so
 * the person says: a loss is lower-is-better.
 */
const ModelRegistry: React.FC<ModelRegistryProps> = ({ projectId, title }) => {
  const compact = useCompactLayout();
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState('');
  const [direction, setDirection] = useState<'max' | 'min'>('max');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(30);
  const [tryFor, setTryFor] = useState<RegistryModel | null>(null);
  const wanted = useDebounced(search).trim();
  const ranking = useDebounced(metric).trim();
  const query: RegistryQuery = {
    ...(projectId ? { projectId } : {}),
    ...(wanted ? { search: wanted } : {}),
    ...(ranking
      ? { metric: ranking, direction, sortBy: 'best', order: direction === 'max' ? 'desc' : 'asc' }
      : {}),
    page: page + 1,
    limit
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['model-registry', query],
    queryFn: () => modelService.list(query),
    placeholderData: previous => previous
  });
  const rows = data?.models ?? [];
  const ranked = Boolean(query.metric);

  const controls = (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
      <TextField
        size="small"
        label="Search"
        placeholder="Run name or repo"
        value={search}
        onChange={event => { setSearch(event.target.value); setPage(0); }}
        sx={{ flex: '1 1 200px' }}
      />
      <TextField
        size="small"
        label="Rank by result"
        placeholder="val.mean_iou"
        value={metric}
        onChange={event => { setMetric(event.target.value); setPage(0); }}
        helperText="A result your runs report, such as val.mean_iou. Leave empty for newest first."
        sx={{ flex: '1 1 220px' }}
      />
      <TextField
        select
        size="small"
        label="Better is"
        value={direction}
        onChange={event => { setDirection(event.target.value as 'max' | 'min'); setPage(0); }}
        disabled={!metric.trim()}
        sx={{ flex: '0 1 160px' }}
      >
        <MenuItem value="max">Higher</MenuItem>
        <MenuItem value="min">Lower</MenuItem>
      </TextField>
    </Box>
  );

  const link = (row: RegistryModel) => (
    <Link href={hubModelUrl(row.model)} target="_blank" rel="noopener noreferrer">
      {row.model.repo} @ {shortRevision(row.model.revision)}
    </Link>
  );

  let content: React.ReactNode;
  if (isLoading) {
    content = <CircularProgress />;
  } else if (isError) {
    content = <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load models'}</Alert>;
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon={<ModelIcon />}
        title={search || metric ? 'No models match' : 'No models yet'}
        description={
          search || metric
            ? 'Try a different search, or a result these runs report.'
            : 'A model appears here once a run links it: set the project’s storage to Hugging Face, then call run.log_model(...) from your training script.'
        }
      />
    );
  } else if (compact) {
    content = (
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {rows.map(row => (
          <MobileListRow
            key={row.model._id}
            to={`/trainings/${row.training._id}`}
            title={`${row.model.repo} @ ${shortRevision(row.model.revision)}`}
            meta={<span>{row.training.name}{row.project ? ` · ${row.project.name}` : ''}</span>}
            figures={[
              { label: ranked ? row.checkpoint?.metric ?? row.best?.metric ?? 'Score' : 'Dataset', value: ranked ? formatBest(row) : datasetName(row) },
              { label: 'Linked', value: formatDate(row.model.addedAt) },
              ...(row.evaluations ? [{ label: 'Evaluated', value: row.evaluations.map(evaluationText).join(' · ') }] : [])
            ]}
            actionsLabel={`Actions for ${row.model.repo}`}
            actions={[{ label: 'Try it', onClick: () => setTryFor(row) }]}
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
              <TableCell>Model</TableCell>
              <TableCell>Run</TableCell>
              {!projectId && <TableCell>Project</TableCell>}
              <TableCell>Dataset</TableCell>
              {ranked && <TableCell align="right">{query.metric}</TableCell>}
              <TableCell>Linked</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.model._id} hover>
                <TableCell>
                  {link(row)}
                  {row.model.space && (
                    <Link href={hubSpaceUrl(row.model.space)} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ ml: 1 }}>
                      Open demo
                    </Link>
                  )}
                  <Link component="button" type="button" variant="caption" onClick={() => setTryFor(row)} sx={{ ml: 1 }}>
                    Try it
                  </Link>
                  {row.evaluations && (
                    <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }} aria-label="Evaluations">
                      Evaluated:{' '}
                      {row.evaluations.map((evaluation, index) => (
                        <React.Fragment key={evaluation.evaluationId}>
                          {index > 0 && ' · '}
                          <Link component={RouterLink} to={`/evaluations/${evaluation.evaluationId}`}>{evaluationText(evaluation)}</Link>
                          {evaluation.evidence === 'reported' || evaluation.evidence === 'attested' ? ` (${evaluation.evidence})` : ''}
                        </React.Fragment>
                      ))}
                    </Typography>
                  )}
                  {(row.model.path || row.model.epoch !== undefined) && (
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                      {[row.model.path, row.model.epoch !== undefined ? `epoch ${row.model.epoch}` : undefined].filter(Boolean).join(' · ')}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Link component={RouterLink} to={`/trainings/${row.training._id}`}>{row.training.name}</Link>
                </TableCell>
                {!projectId && (
                  <TableCell>
                    {row.project ? <Link component={RouterLink} to={`/projects/${row.project.slug ?? row.project._id}`}>{row.project.name}</Link> : '-'}
                  </TableCell>
                )}
                <TableCell>{datasetName(row)}</TableCell>
                {ranked && (
                  <TableCell align="right">
                    {scoreOf(row).text}
                    {scoreOf(row).note && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                        {scoreOf(row).note}
                      </Typography>
                    )}
                  </TableCell>
                )}
                <TableCell>{formatDate(row.model.addedAt)}</TableCell>
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
      {controls}
      {content}
      {tryFor && <ModelTryDialog trainingId={tryFor.training._id} model={tryFor.model} onClose={() => setTryFor(null)} />}
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

export default ModelRegistry;
