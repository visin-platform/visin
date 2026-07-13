import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  ChipProps,
  alpha,
  Theme
} from '@mui/material';
import {
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { Comparison } from '@/types';

interface ComparisonsTableProps {
  comparisons: Comparison[];
  sortBy: 'name' | 'type' | 'createdAt' | 'itemCount';
  sortOrder: 'asc' | 'desc';
  onSort: (column: 'name' | 'type' | 'createdAt' | 'itemCount') => void;
  onViewComparison: (comparison: Comparison) => void;
  onEditComparison: (comparison: Comparison) => void;
  onDeleteComparison: (id: string) => void;
  canDelete: boolean;
  formatTimestamp: (timestamp: string) => string;
  getTypeColor: (type: string) => ChipProps['color'];
  theme: Theme;
}

const ComparisonsTable: React.FC<ComparisonsTableProps> = ({
  comparisons,
  sortBy,
  sortOrder,
  onSort,
  onViewComparison,
  onEditComparison,
  onDeleteComparison,
  canDelete,
  formatTimestamp,
  getTypeColor,
  theme
}) => {
  return (
    <TableContainer 
      component={Paper} 
      elevation={0} 
      sx={{ 
        borderRadius: 2, 
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden'
      }}
    >
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
            <TableCell sx={{ fontWeight: 600 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => onSort('name')}
              >
                Name
                {sortBy === 'name' && (
                  sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                )}
              </Box>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
            <TableCell sx={{ fontWeight: 600 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => onSort('type')}
              >
                Type
                {sortBy === 'type' && (
                  sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                )}
              </Box>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => onSort('itemCount')}
              >
                Items Count
                {sortBy === 'itemCount' && (
                  sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                )}
              </Box>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => onSort('createdAt')}
              >
                Created At
                {sortBy === 'createdAt' && (
                  sortOrder === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                )}
              </Box>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {comparisons.map((comparison) => (
            <TableRow
              key={comparison._id}
              onClick={() => onViewComparison(comparison)}
              sx={{
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'action.hover' }
              }}
            >
              <TableCell>
                <Typography variant="body2">
                  {comparison.name}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  {comparison.description || 'No description'}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={comparison.type}
                  color={getTypeColor(comparison.type)}
                  size="small"
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {comparison.itemIds.length} item{comparison.itemIds.length !== 1 ? 's' : ''}
                </Typography>
              </TableCell>
              <TableCell>
                {formatTimestamp(comparison.createdAt)}
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {canDelete && (
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditComparison(comparison);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canDelete && (
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteComparison(comparison._id);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ComparisonsTable;
