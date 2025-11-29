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
  Checkbox
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
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

const getStatusColor = (status: Training['status']): 'success' | 'error' | 'default' | 'warning' => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'default';
    case 'failed':
      return 'error';
    case 'pending':
      return 'default';
    default:
      return 'default';
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
  return `${day}.${month}.${year} ${time}`;
};

const formatDuration = (seconds: number) => {
  if (seconds === 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
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
  
  return (
    <TableCell 
      align={align} 
      sx={{ 
        fontWeight: 'bold',
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
      }}
      onClick={() => onSort(column)}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {children}
        {isActive && (
          sortOrder === 'asc' ? 
            <ArrowUpwardIcon fontSize="small" /> : 
            <ArrowDownwardIcon fontSize="small" />
        )}
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
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }

  if (trainings.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          {searchTerm
            ? 'No trainings found matching your search'
            : 'No training runs available'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ fontWeight: 'bold' }}>
                <Checkbox
                  indeterminate={
                    selectedTrainingIds.size > 0 && selectedTrainingIds.size < trainings.length
                  }
                  checked={trainings.length > 0 && selectedTrainingIds.size === trainings.length}
                  onChange={onSelectAll}
                  disabled={trainings.length === 0}
                />
              </TableCell>
              <SortableTableCell column="name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                Name
              </SortableTableCell>
              <TableCell><strong>Description</strong></TableCell>
              <SortableTableCell column="status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Status
              </SortableTableCell>
              <SortableTableCell column="epochCount" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Epochs
              </SortableTableCell>
              <SortableTableCell column="totalTime" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Time
              </SortableTableCell>
              <SortableTableCell column="cpuCost" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                CPU Cost
              </SortableTableCell>
              <SortableTableCell column="gpuCost" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                GPU Cost
              </SortableTableCell>
              <SortableTableCell column="totalCost" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} align="center">
                Total Cost
              </SortableTableCell>
              <SortableTableCell column="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                Created
              </SortableTableCell>
              <SortableTableCell column="updatedAt" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort}>
                Updated
              </SortableTableCell>
              <TableCell align="center"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trainings.map((training: Training) => (
              <TableRow
                key={training._id}
                hover
                selected={selectedTrainingIds.has(training._id)}
                sx={{
                  cursor: 'pointer',
                  backgroundColor: selectedTrainingIds.has(training._id)
                    ? 'rgba(25, 118, 210, 0.08)'
                    : 'inherit'
                }}
                onClick={() => navigate(`/trainings/${training._id}`)}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedTrainingIds.has(training._id)}
                    onChange={() => onSelectTraining(training._id)}
                    onClick={(e) => e.stopPropagation()}
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
                      <Typography variant="body2" fontWeight={600}>
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
                              height: '18px',
                              fontSize: '0.7rem',
                              '& .MuiChip-label': {
                                px: 0.5,
                                py: 0
                              }
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 250 }}>
                    {training.description || '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={training.status}
                    color={getStatusColor(training.status)}
                    size="small"
                    sx={{ textTransform: 'capitalize' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {training.metrics ? training.metrics.maxEpoch || 0 : 0}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {training.metrics ? formatDuration(training.metrics.totalTime) : '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {training.metrics ? `€${training.metrics.cpuCost.toFixed(3)}` : '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {training.metrics ? `€${training.metrics.gpuCost.toFixed(3)}` : '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {training.metrics ? `€${((training.metrics.cpuCost || 0) + (training.metrics.gpuCost || 0)).toFixed(3)}` : '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(training.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(training.updatedAt)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Tooltip title="Edit training">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEdit(training);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete training">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDelete(training._id);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50, 100]}
        component="div"
        count={total}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
      />
    </Paper>
  );
};

export default TrainingsTable;
