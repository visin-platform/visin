import { trainingStatusLabel } from '../utils/trainingStatus';
import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Checkbox,
  MenuItem,
  TextField,
  useTheme
} from '@mui/material';
import { useCompactLayout, livePalette, tint, ListSkeleton } from '@visin/frontend-core';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  PlayArrow as RunIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Schedule as PendingIcon
} from '@mui/icons-material';
import { MobileListHeader, MobileListRow } from './common/MobileList';
import { Link, useNavigate } from 'react-router-dom';
import { Training } from '../types';
import { formatDateTime, formatDuration } from '../utils';
import { useFormatCost } from '../costing/useCosting';

interface TrainingsTableProps {
  trainings: Training[];
  isLoading: boolean;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onEdit: (training: Training) => void;
  onDelete: (trainingId: string) => void;
  searchTerm: string;
  selectedTrainingIds: Set<string>;
  onSelectTraining: (trainingId: string) => void;
  onSelectAll: () => void;
  sortBy:
    'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortOrder: 'asc' | 'desc';
  onSort: (
    column:
      'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount'
  ) => void;
  isAuthenticated: boolean;
  canWrite?: (id: string) => boolean;
  /**
   * Project names by id. Given, and sorted newest first, the runs are shown
   * grouped under their project; without it the list is flat, as sorted.
   */
  projectNames?: Record<string, string>;
}

/** A run of consecutive rows, headed by its project when the list is grouped. */
interface RunSection {
  key: string;
  /** The project's name; absent for a flat list. */
  name?: string;
  projectId?: string;
  runs: Training[];
}

const NO_PROJECT = '__none__';

/**
 * Groups one page of runs under their projects, the project with the most
 * recent run first and each project's runs in the order they came, so a feed
 * of recent work reads by project rather than interleaved.
 */
const groupRuns = (trainings: Training[], projectNames: Record<string, string>): RunSection[] => {
  const sections = new Map<string, RunSection>();
  for (const training of trainings) {
    const key = training.projectId ?? NO_PROJECT;
    const section = sections.get(key) ?? {
      key,
      projectId: training.projectId,
      name: training.projectId ? (projectNames[training.projectId] ?? 'Unknown project') : 'No project',
      runs: []
    };
    section.runs.push(training);
    sections.set(key, section);
  }
  return [...sections.values()];
};

const StatusChip: React.FC<{ training: Training }> = ({ training }) => {
  const { status } = training;
  const theme = useTheme();

  let color = livePalette(theme).text.secondary;
  let bgcolor = livePalette(theme).action.hover;
  let icon = <PendingIcon style={{ fontSize: 16 }} />;
  const label = trainingStatusLabel(training);

  switch (status) {
    case 'completed':
      color = livePalette(theme).success.main;
      bgcolor = tint(livePalette(theme).success.main, 0.1);
      icon = <SuccessIcon style={{ fontSize: 16 }} />;
      break;
    case 'running':
      color = livePalette(theme).info.main;
      bgcolor = tint(livePalette(theme).info.main, 0.1);
      icon = <RunIcon style={{ fontSize: 16 }} />;
      break;
    case 'failed':
      color = livePalette(theme).error.main;
      bgcolor = tint(livePalette(theme).error.main, 0.1);
      icon = <ErrorIcon style={{ fontSize: 16 }} />;
      break;
    case 'stalled':
    case 'pending':
      color = livePalette(theme).warning.main;
      bgcolor = tint(livePalette(theme).warning.main, 0.1);
      icon = <PendingIcon style={{ fontSize: 16 }} />;
      break;
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        bgcolor: bgcolor,
        color: color,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize'
      }}
    >
      {icon}
      {label}
    </Box>
  );
};

interface SortableTableCellProps {
  children: React.ReactNode;
  column:
    'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortBy:
    'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortOrder: 'asc' | 'desc';
  onSort: (
    column:
      'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount'
  ) => void;
  align?: 'left' | 'center' | 'right';
  /** Where the column shows, e.g. `LARGE_ONLY`. */
  display?: { xs: string; lg?: string; xl?: string };
}

// Run names are long and are what the table is for; on a narrower desktop the
// secondary columns step aside rather than squeeze the names into a strip.
const LARGE_ONLY = { xs: 'none', lg: 'table-cell' };
const WIDE_ONLY = { xs: 'none', xl: 'table-cell' };

const SortableTableCell: React.FC<SortableTableCellProps> = ({
  children,
  column,
  sortBy,
  sortOrder,
  onSort,
  align = 'left',
  display
}) => {
  const isActive = sortBy === column;
  const theme = useTheme();

  return (
    <TableCell
      align={align}
      sx={{
        display,
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        color: isActive ? livePalette(theme).primary.main : 'text.primary',
        transition: 'background-color 0.2s',
        '&:hover': { backgroundColor: livePalette(theme).action.hover }
      }}
      onClick={() => onSort(column)}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          justifyContent: align === 'center' ? 'center' : 'flex-start'
        }}
      >
        {children}
        <Box sx={{ width: 20, display: 'flex', justifyContent: 'center' }}>
          {isActive &&
            (sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />)}
        </Box>
      </Box>
    </TableCell>
  );
};

type SortColumn = TrainingsTableProps['sortBy'];

const SORT_OPTIONS: { value: SortColumn; label: string }[] = [
  { value: 'updatedAt', label: 'Updated' },
  { value: 'createdAt', label: 'Created' },
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'epochCount', label: 'Epochs' },
  { value: 'totalTime', label: 'Time' },
  { value: 'totalCost', label: 'Cost' }
];

/** Tags shown on a phone row before the rest collapse into "+N". */
const PHONE_TAGS = 3;

/**
 * The phone layout: one full-width row per run. Run names are long and are the
 * point of the row, so they get the whole width and wrap; everything a column
 * held on desktop becomes one line under it.
 */
const TrainingList: React.FC<
  Omit<
    TrainingsTableProps,
    | 'isLoading'
    | 'searchTerm'
    | 'onPageChange'
    | 'onRowsPerPageChange'
    | 'page'
    | 'rowsPerPage'
    | 'total'
    | 'projectNames'
  > & { formatCost: ReturnType<typeof useFormatCost>; sections: RunSection[] }
> = ({
  trainings,
  sections,
  onEdit,
  onDelete,
  selectedTrainingIds,
  onSelectTraining,
  onSelectAll,
  sortBy,
  sortOrder,
  onSort,
  isAuthenticated,
  canWrite = () => false,
  formatCost
}) => {
  const allSelected = trainings.length > 0 && selectedTrainingIds.size === trainings.length;

  return (
    <>
      <MobileListHeader
        selectAll={{
          checked: allSelected,
          indeterminate: selectedTrainingIds.size > 0 && !allSelected,
          onChange: onSelectAll,
          label: 'Select all trainings'
        }}
      >
        <TextField
          select
          size="small"
          label="Sort by"
          value={sortBy}
          onChange={(event) => onSort(event.target.value as SortColumn)}
          sx={{ minWidth: 130 }}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <IconButton
          aria-label={sortOrder === 'asc' ? 'Sorted ascending' : 'Sorted descending'}
          onClick={() => onSort(sortBy)}
        >
          {sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
        </IconButton>
      </MobileListHeader>

      {sections.map((section) => (
        <React.Fragment key={section.key}>
          {section.name !== undefined && (
            <Typography
              variant="overline"
              component="div"
              sx={{ px: 2, py: 0.75, color: 'text.secondary', bgcolor: 'action.hover', lineHeight: 1.6 }}
            >
              {section.projectId ? (
                <Link to={`/projects/${section.projectId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {section.name}
                </Link>
              ) : (
                section.name
              )}
            </Typography>
          )}
          {section.runs.map((training) => {
            const metrics = training.metrics;
            const details = [
              metrics ? `${metrics.epochCount || 0} epochs` : null,
              metrics ? formatDuration(metrics.totalTime) : null,
              metrics ? formatCost((metrics.cpuCost || 0) + (metrics.gpuCost || 0), metrics.currency) : null
            ].filter((part) => part && part !== '-');
            const writable = isAuthenticated && canWrite(training._id);

            return (
              <MobileListRow
                key={training._id}
                to={`/trainings/${training._id}`}
                title={training.name}
                selected={selectedTrainingIds.has(training._id)}
                onToggle={() => onSelectTraining(training._id)}
                selectLabel={`Select ${training.name}`}
                meta={
                  <>
                    <StatusChip training={training} />
                    {details.length > 0 && <span>{details.join(' · ')}</span>}
                  </>
                }
                chips={training.tags ?? []}
                maxChips={PHONE_TAGS}
                footer={`Updated ${formatDateTime(training.updatedAt)}`}
                actionsLabel={`Actions for ${training.name}`}
                actions={
                  writable
                    ? [
                        { label: 'Edit', icon: <EditIcon fontSize="small" />, onClick: () => onEdit(training) },
                        {
                          label: 'Delete',
                          icon: <DeleteIcon fontSize="small" />,
                          onClick: () => onDelete(training._id),
                          danger: true
                        }
                      ]
                    : []
                }
              />
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
};

export const TrainingsTable: React.FC<TrainingsTableProps> = ({
  trainings,
  isLoading,
  page,
  rowsPerPage,
  total,
  onPageChange,
  onRowsPerPageChange,
  onEdit,
  onDelete,
  searchTerm,
  selectedTrainingIds,
  onSelectTraining,
  onSelectAll,
  sortBy,
  sortOrder,
  onSort,
  isAuthenticated,
  canWrite = () => false,
  projectNames
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const formatCost = useFormatCost();
  const compact = useCompactLayout();
  // Grouping is for a recency feed: sorted by name, cost or status, a project's
  // runs would be pulled apart from the order that was asked for.
  const grouped = projectNames !== undefined && (sortBy === 'updatedAt' || sortBy === 'createdAt');
  const sections = useMemo<RunSection[]>(
    () => (grouped ? groupRuns(trainings, projectNames) : [{ key: 'all', runs: trainings }]),
    [grouped, trainings, projectNames]
  );

  if (isLoading) {
    return (
      <ListSkeleton rows={6} label="Loading trainings" />
    );
  }

  if (trainings.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 6,
          textAlign: 'center',
          borderRadius: 2,
          border: `1px solid ${livePalette(theme).divider}`,
          bgcolor: 'background.paper'
        }}
      >
        <Typography
          variant="h6"
          gutterBottom
          sx={{
            color: 'text.secondary'
          }}
        >
          {searchTerm ? 'No trainings found matching your search' : 'No training runs available'}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary'
          }}
        >
          {searchTerm ? 'Try adjusting your filters' : 'Create a new training to get started'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: `1px solid ${livePalette(theme).divider}`,
        overflow: 'hidden'
      }}
    >
      {compact ? (
        <TrainingList
          trainings={trainings}
          sections={sections}
          onEdit={onEdit}
          onDelete={onDelete}
          selectedTrainingIds={selectedTrainingIds}
          onSelectTraining={onSelectTraining}
          onSelectAll={onSelectAll}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          isAuthenticated={isAuthenticated}
          canWrite={canWrite}
          formatCost={formatCost}
        />
      ) : (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: tint(livePalette(theme).primary.main, 0.02) }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selectedTrainingIds.size > 0 && selectedTrainingIds.size < trainings.length}
                    checked={trainings.length > 0 && selectedTrainingIds.size === trainings.length}
                    onChange={onSelectAll}
                    disabled={trainings.length === 0}
                    color="primary"
                  />
                </TableCell>
                <SortableTableCell column="name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                  Name
                </SortableTableCell>
                <TableCell sx={{ fontWeight: 600, display: WIDE_ONLY }}>Description</TableCell>
                <SortableTableCell column="status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                  Status
                </SortableTableCell>
                <SortableTableCell
                  column="epochCount"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  align="center"
                >
                  Epochs
                </SortableTableCell>
                <SortableTableCell
                  column="totalTime"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  align="center"
                >
                  Time
                </SortableTableCell>
                <SortableTableCell
                  column="totalCost"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  align="center"
                >
                  Cost
                </SortableTableCell>
                <SortableTableCell
                  column="createdAt"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  display={LARGE_ONLY}
                >
                  Created
                </SortableTableCell>
                <SortableTableCell column="updatedAt" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                  Updated
                </SortableTableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sections.map((section) => (
                <React.Fragment key={section.key}>
                  {section.name !== undefined && (
                    <TableRow>
                      <TableCell colSpan={10} sx={{ bgcolor: 'action.hover', py: 0.75 }}>
                        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                          {section.projectId ? (
                            <Link
                              to={`/projects/${section.projectId}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {section.name}
                            </Link>
                          ) : (
                            section.name
                          )}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {section.runs.map((training: Training) => {
                    const isSelected = selectedTrainingIds.has(training._id);
                    return (
                      <TableRow
                        key={training._id}
                        hover
                        selected={isSelected}
                        sx={{
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          '&.Mui-selected': {
                            backgroundColor: tint(livePalette(theme).primary.main, 0.08),
                            '&:hover': {
                              backgroundColor: tint(livePalette(theme).primary.main, 0.12)
                            }
                          }
                        }}
                        onClick={() => navigate(`/trainings/${training._id}`)}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => onSelectTraining(training._id)}
                            onClick={(e) => e.stopPropagation()}
                            color="primary"
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 260 }}>
                          <Box>
                            <Link
                              to={`/trainings/${training._id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/trainings/${training._id}`);
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="primary"
                                sx={{
                                  fontWeight: 600
                                }}
                              >
                                {training.name}
                              </Typography>
                            </Link>
                            {training.tags && training.tags.length > 0 && (
                              <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {training.tags.map((tag) => (
                                  <Chip
                                    key={tag}
                                    label={tag}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                      height: '20px',
                                      fontSize: '0.65rem',
                                      borderColor: tint(livePalette(theme).divider, 0.8),
                                      '& .MuiChip-label': { px: 0.5, py: 0 }
                                    }}
                                  />
                                ))}
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ display: WIDE_ONLY }}>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              color: 'text.secondary',
                              maxWidth: 200
                            }}
                          >
                            {training.description || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <StatusChip training={training} />
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500
                            }}
                          >
                            {training.metrics ? training.metrics.epochCount || 0 : 0}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'text.secondary'
                            }}
                          >
                            {training.metrics ? formatDuration(training.metrics.totalTime) : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500
                            }}
                          >
                            {training.metrics
                              ? formatCost(
                                  (training.metrics.cpuCost || 0) + (training.metrics.gpuCost || 0),
                                  training.metrics.currency
                                )
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ display: LARGE_ONLY }}>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'text.secondary'
                            }}
                          >
                            {formatDateTime(training.createdAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'text.secondary'
                            }}
                          >
                            {formatDateTime(training.updatedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            {isAuthenticated && canWrite(training._id) && (
                              <>
                                <Tooltip title="Edit training">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onEdit(training);
                                    }}
                                    sx={{
                                      color: livePalette(theme).text.secondary,
                                      '&:hover': { color: livePalette(theme).primary.main }
                                    }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete training">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onDelete(training._id);
                                    }}
                                    sx={{
                                      color: livePalette(theme).text.secondary,
                                      '&:hover': { color: livePalette(theme).error.main }
                                    }}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={total}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        labelRowsPerPage={compact ? 'Rows' : 'Rows per page:'}
        sx={{ borderTop: compact ? 0 : `1px solid ${livePalette(theme).divider}` }}
      />
    </Paper>
  );
};

export default TrainingsTable;
