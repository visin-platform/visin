import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  CircularProgress,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Checkbox,
  useTheme,
  alpha
} from '@mui/material';
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
import { Link, useNavigate } from 'react-router-dom';
import { Training } from '../types';

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
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount') => void;
}

const StatusChip: React.FC<{ status: Training['status'] }> = ({ status }) => {
  const theme = useTheme();
  
  let color = theme.palette.text.secondary;
  let bgcolor = theme.palette.action.hover;
  let icon = <PendingIcon style={{ fontSize: 16 }} />;
  let label = status;

  switch (status) {
    case 'completed':
      color = theme.palette.success.main;
      bgcolor = alpha(theme.palette.success.main, 0.1);
      icon = <SuccessIcon style={{ fontSize: 16 }} />;
      break;
    case 'running':
      color = theme.palette.info.main;
      bgcolor = alpha(theme.palette.info.main, 0.1);
      icon = <RunIcon style={{ fontSize: 16 }} />;
      break;
    case 'failed':
      color = theme.palette.error.main;
      bgcolor = alpha(theme.palette.error.main, 0.1);
      icon = <ErrorIcon style={{ fontSize: 16 }} />;
      break;
    case 'pending':
      color = theme.palette.warning.main;
      bgcolor = alpha(theme.palette.warning.main, 0.1);
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

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const formatDuration = (seconds: number) => {
  if (seconds === 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

interface SortableTableCellProps {
  children: React.ReactNode;
  column: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount') => void;
  align?: 'left' | 'center' | 'right';
}

const SortableTableCell: React.FC<SortableTableCellProps> = ({
  children,
  column,
  sortBy,
  sortOrder,
  onSort,
  align = 'left'
}) => {
  const isActive = sortBy === column;
  const theme = useTheme();
  
  return (
    <TableCell 
      align={align} 
      sx={{ 
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        color: isActive ? theme.palette.primary.main : 'text.primary',
        transition: 'background-color 0.2s',
        '&:hover': { backgroundColor: theme.palette.action.hover }
      }}
      onClick={() => onSort(column)}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
        {children}
        <Box sx={{ width: 20, display: 'flex', justifyContent: 'center' }}>
          {isActive && (
            sortOrder === 'asc' ? 
              <ArrowUpwardIcon fontSize="small" /> : 
              <ArrowDownwardIcon fontSize="small" />
          )}
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
  onSort
}) => {
  const navigate = useNavigate();
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
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
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {searchTerm
            ? 'No trainings found matching your search'
            : 'No training runs available'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
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
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden'
      }}
    >
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={
                    selectedTrainingIds.size > 0 && selectedTrainingIds.size < trainings.length
                  }
                  checked={trainings.length > 0 && selectedTrainingIds.size === trainings.length}
                  onChange={onSelectAll}
                  disabled={trainings.length === 0}
                  color="primary"
                />
              </TableCell>
              <SortableTableCell column="name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                Name
              </SortableTableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <SortableTableCell column="status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Status
              </SortableTableCell>
              <SortableTableCell column="epochCount" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Epochs
              </SortableTableCell>
              <SortableTableCell column="totalTime" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Time
              </SortableTableCell>
              <SortableTableCell column="totalCost" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Cost
              </SortableTableCell>
              <SortableTableCell column="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                Created
              </SortableTableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trainings.map((training: Training) => {
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
                      backgroundColor: alpha(theme.palette.primary.main, 0.08),
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
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
                  <TableCell>
                    <Box>
                      <Link 
                        to={`/trainings/${training._id}`} 
                        style={{ textDecoration: 'none', color: 'inherit' }}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/trainings/${training._id}`);
                        }}
                      >
                        <Typography variant="body2" fontWeight={600} color="primary">
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
                                borderColor: alpha(theme.palette.divider, 0.8),
                                '& .MuiChip-label': { px: 0.5, py: 0 }
                              }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                      {training.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <StatusChip status={training.status} />
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" fontWeight={500}>
                      {training.metrics ? training.metrics.maxEpoch || 0 : 0}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" color="text.secondary">
                      {training.metrics ? formatDuration(training.metrics.totalTime) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2" fontWeight={500}>
                      {training.metrics ? `€${((training.metrics.cpuCost || 0) + (training.metrics.gpuCost || 0)).toFixed(2)}` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(training.createdAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title="Edit training">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEdit(training);
                          }}
                          sx={{ color: theme.palette.text.secondary, '&:hover': { color: theme.palette.primary.main } }}
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
                          sx={{ color: theme.palette.text.secondary, '&:hover': { color: theme.palette.error.main } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={total}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        sx={{ borderTop: `1px solid ${theme.palette.divider}` }}
      />
    </Paper>
  );
};

export default TrainingsTable;
