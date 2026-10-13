import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  IconButton,
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
import { ExpandMore as ExpandIcon, Memory as ModelIcon } from '@mui/icons-material';
import { EmptyState, ListSkeleton, useCompactLayout } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import ModelTryDialog from './ModelTryDialog';
import StoredModelDownloads from './StoredModelDownloads';
import { MobileListRow } from '../common/MobileList';
import { modelService } from '../../services/modelService';
import type { RegistryEvaluation, RegistryModel, RegistryQuery } from '../../types/modelRegistry';
import { formatDate } from '../../utils';
import { hubModelUrl, hubSpaceUrl } from '../../utils/hubLinks';
import { groupModelRows, isHubModel, modelTitle, type GroupedModelRow } from '../../utils/modelLinks';
import { storedModelBlock, storedModelFileUrl } from '../../providers/visin';
import type { HubModelReference } from '../../types/training';

interface ModelRegistryProps {
  /** Only this project's models; without it, every project the caller can see. */
  projectId?: string;
  /** Only the models of runs trained on this dataset. */
  datasetId?: string;
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
  if (row.checkpoint)
    return { text: formatReading(row.checkpoint), note: peak ? `this checkpoint · ${peak}` : 'this checkpoint' };
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
 * Every model linked to a run, a pointer to the Hub or a checkpoint Visin keeps, newest first, or ranked by a result you name: the
 * epoch a checkpoint was saved at when the link says which, else how well its run did. The page a researcher opens to answer "which model
 * should I use?". Whether larger is better for a result is not known to Visin, so
 * the person says: a loss is lower-is-better.
 */
const ModelRegistry: React.FC<ModelRegistryProps> = ({ projectId, datasetId, title }) => {
  const compact = useCompactLayout();
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState('');
  const [direction, setDirection] = useState<'max' | 'min'>('max');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(30);
  const [tryFor, setTryFor] = useState<{ trainingId: string; model: HubModelReference } | null>(null);
  // Which rows are open to their detail: dataset, path and epoch, evaluations.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggleOpened = (id: string) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const wanted = useDebounced(search).trim();
  const ranking = useDebounced(metric).trim();
  const query: RegistryQuery = {
    ...(projectId ? { projectId } : {}),
    ...(datasetId ? { datasetId } : {}),
    ...(wanted ? { search: wanted } : {}),
    ...(ranking ? { metric: ranking, direction, sortBy: 'best', order: direction === 'max' ? 'desc' : 'asc' } : {}),
    page: page + 1,
    limit
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['model-registry', query],
    queryFn: () => modelService.list(query),
    placeholderData: (previous) => previous
  });
  const rows = groupModelRows(data?.models ?? []);
  const ranked = Boolean(query.metric);

  const controls = (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
      <TextField
        size="small"
        label="Search"
        placeholder="Run name, repo or file"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
        sx={{ flex: '1 1 200px' }}
      />
      <TextField
        size="small"
        label="Rank by result"
        placeholder="val.mean_iou"
        value={metric}
        onChange={(event) => {
          setMetric(event.target.value);
          setPage(0);
        }}
        title="A result your runs report, such as val.mean_iou. Leave empty for newest first."
        sx={{ flex: '1 1 220px' }}
      />
      <TextField
        select
        size="small"
        label="Better is"
        value={direction}
        onChange={(event) => {
          setDirection(event.target.value as 'max' | 'min');
          setPage(0);
        }}
        disabled={!metric.trim()}
        sx={{ flex: '0 1 160px' }}
      >
        <MenuItem value="max">Higher</MenuItem>
        <MenuItem value="min">Lower</MenuItem>
      </TextField>
    </Box>
  );

  /** How a model is named and reached: a Hub repo's page and a way to try it, or the files this deployment keeps. */
  const modelCell = ({ row, stored }: GroupedModelRow) => {
    const { model } = row;
    if (!isHubModel(model)) {
      return (
        <>
          <Typography variant="body2" component="div">
            {modelTitle(model)}
            <Chip size="small" variant="outlined" label="Visin" sx={{ ml: 1 }} />
          </Typography>
          <StoredModelDownloads trainingId={row.training._id} models={stored} />
        </>
      );
    }
    return (
      <>
        <Link href={hubModelUrl(model)} target="_blank" rel="noopener noreferrer">
          {modelTitle(model)}
        </Link>
        <Chip size="small" variant="outlined" label="Hugging Face" sx={{ ml: 1 }} />
        {model.space && (
          <Link
            href={hubSpaceUrl(model.space)}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={{ ml: 1 }}
          >
            Open demo
          </Link>
        )}
        <Link
          component="button"
          type="button"
          variant="caption"
          onClick={() => setTryFor({ trainingId: row.training._id, model })}
          sx={{ ml: 1 }}
        >
          Try it
        </Link>
      </>
    );
  };

  /** What a person may do with a model from a phone's row menu: try a Hub model, or download each stored format. */
  const rowActions = ({ row, stored }: GroupedModelRow) => {
    const { model } = row;
    if (isHubModel(model))
      return [{ label: 'Try it', onClick: () => setTryFor({ trainingId: row.training._id, model }) }];
    return stored
      .filter((file) => !storedModelBlock(file))
      .map((file) => ({
        label: `Download .${file.format}`,
        onClick: () => window.location.assign(storedModelFileUrl(row.training._id, file._id))
      }));
  };

  let content: React.ReactNode;
  if (isLoading) {
    content = <ListSkeleton rows={6} label="Loading models" />;
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
            : 'A model appears here once a run links it: call run.save_model(...) from your training script to keep it on Visin, or set the project’s storage to Hugging Face and call run.log_model(...).'
        }
      />
    );
  } else if (compact) {
    content = (
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {rows.map((grouped) => {
          const { row, stored } = grouped;
          return (
            <Box key={row.model._id}>
              <MobileListRow
                to={`/trainings/${row.training._id}`}
                title={modelTitle(row.model)}
                meta={
                  <span>
                    {row.training.name}
                    {row.project ? ` · ${row.project.name}` : ''}
                  </span>
                }
                figures={[
                  {
                    label: ranked ? (row.checkpoint?.metric ?? row.best?.metric ?? 'Score') : 'Dataset',
                    value: ranked ? formatBest(row) : datasetName(row)
                  },
                  { label: 'Linked', value: formatDate(row.model.addedAt) },
                  ...(row.evaluations
                    ? [{ label: 'Evaluated', value: row.evaluations.map(evaluationText).join(' · ') }]
                    : [])
                ]}
                actionsLabel={`Actions for ${isHubModel(row.model) ? row.model.repo : modelTitle(row.model)}`}
                actions={rowActions(grouped)}
              />
              {stored.length > 0 && (
                <Box sx={{ px: 2, pb: 1 }}>
                  <StoredModelDownloads trainingId={row.training._id} models={stored} />
                </Box>
              )}
            </Box>
          );
        })}
      </Paper>
    );
  } else {
    content = (
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Model</TableCell>
              <TableCell>Run</TableCell>
              {!projectId && <TableCell>Project</TableCell>}
              {ranked && <TableCell align="right">{query.metric}</TableCell>}
              <TableCell>Linked</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((grouped) => {
              const { row } = grouped;
              const isOpen = opened.has(row.model._id);
              const columns = 4 + (projectId ? 0 : 1) + (ranked ? 1 : 0);
              const where = [
                isHubModel(row.model) ? row.model.path : undefined,
                row.model.epoch !== undefined ? `epoch ${row.model.epoch}` : undefined
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <React.Fragment key={row.model._id}>
                  <TableRow hover sx={{ '& > td': { borderBottom: isOpen ? 'none' : undefined } }}>
                    <TableCell padding="checkbox">
                      <IconButton
                        size="small"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${modelTitle(row.model)}`}
                        onClick={() => toggleOpened(row.model._id)}
                      >
                        <ExpandIcon
                          fontSize="small"
                          sx={{ transition: 'transform .2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        />
                      </IconButton>
                    </TableCell>
                    <TableCell>{modelCell(grouped)}</TableCell>
                    <TableCell>
                      <Link component={RouterLink} to={`/trainings/${row.training._id}`}>
                        {row.training.name}
                      </Link>
                    </TableCell>
                    {!projectId && (
                      <TableCell>
                        {row.project ? (
                          <Link component={RouterLink} to={`/projects/${row.project.slug ?? row.project._id}`}>
                            {row.project.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    )}
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
                  {isOpen && (
                    <TableRow>
                      <TableCell colSpan={columns} sx={{ py: 0 }}>
                        <Box sx={{ pb: 1.5, pl: 5, display: 'grid', gap: 0.5 }}>
                          <Typography variant="body2">
                            <Box component="span" sx={{ color: 'text.secondary' }}>
                              Dataset:{' '}
                            </Box>
                            {datasetName(row)}
                          </Typography>
                          {where && (
                            <Typography variant="body2">
                              <Box component="span" sx={{ color: 'text.secondary' }}>
                                Checkpoint:{' '}
                              </Box>
                              {where}
                            </Typography>
                          )}
                          {row.evaluations && (
                            <Typography variant="body2" aria-label="Evaluations">
                              <Box component="span" sx={{ color: 'text.secondary' }}>
                                Evaluated:{' '}
                              </Box>
                              {row.evaluations.map((evaluation, index) => (
                                <React.Fragment key={evaluation.evaluationId}>
                                  {index > 0 && ' · '}
                                  <Link component={RouterLink} to={`/evaluations/${evaluation.evaluationId}`}>
                                    {evaluationText(evaluation)}
                                  </Link>
                                  {evaluation.evidence === 'reported' || evaluation.evidence === 'attested'
                                    ? ` (${evaluation.evidence})`
                                    : ''}
                                </React.Fragment>
                              ))}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <Box>
      {title && (
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
      )}
      {controls}
      {content}
      {tryFor && <ModelTryDialog trainingId={tryFor.trainingId} model={tryFor.model} onClose={() => setTryFor(null)} />}
      {data && data.pagination.total > PAGE_SIZES[0] && (
        <TablePagination
          component="div"
          count={data.pagination.total}
          page={page}
          rowsPerPage={limit}
          rowsPerPageOptions={PAGE_SIZES}
          onPageChange={(_event, next) => setPage(next)}
          onRowsPerPageChange={(event) => {
            setLimit(Number(event.target.value));
            setPage(0);
          }}
        />
      )}
    </Box>
  );
};

export default ModelRegistry;
