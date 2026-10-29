import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Paper, Typography, Box, Chip, IconButton, Tooltip, Checkbox, useTheme } from '@mui/material';
import { useCompactLayout, livePalette, tint, ListSkeleton } from '@visin/frontend-core';
import { Edit as EditIcon, Delete as DeleteIcon, ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon } from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import { Training } from '../types';
import { formatDateTime, formatDuration } from '../utils';
import { useFormatCost } from '../costing/useCosting';
import { TrainingsTableProps } from './trainings/trainingsTableTypes';
import { RunSection, groupRuns } from './trainings/trainingRuns';
import { StatusChip } from './trainings/TrainingStatusChip';
import { TrainingList } from './trainings/TrainingList';

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
