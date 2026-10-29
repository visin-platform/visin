import React from 'react';
import { Typography, IconButton, MenuItem, TextField } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon } from '@mui/icons-material';
import { MobileListHeader, MobileListRow } from '../common/MobileList';
import { Link } from 'react-router-dom';
import { formatDateTime, formatDuration } from '../../utils';
import { useFormatCost } from '../../costing/useCosting';
import { TrainingsTableProps } from './trainingsTableTypes';
import { RunSection } from './trainingRuns';
import { StatusChip } from './TrainingStatusChip';

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
export const TrainingList: React.FC<
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
