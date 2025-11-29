import React, { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Box,
  Typography,
  Alert,
  Checkbox,
  Tooltip,
  IconButton,
  TextField
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Compare as CompareIcon,
  Edit as EditIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { getAllAnalyses, DatasetAnalysis, deleteAnalysis, updateAnalysis } from '../services/analysisService';

interface AnalysisTableProps {
  selectedAnalysisIds?: Set<string>;
  onSelectAnalysis?: (analysisId: string) => void;
  onSelectAll?: (allIds: string[]) => void;
  onCompareSelected?: () => void;
}

export const AnalysisTable: React.FC<AnalysisTableProps> = ({
  selectedAnalysisIds = new Set(),
  onSelectAnalysis = () => {},
  onSelectAll = () => {},
  onCompareSelected = () => {}
}) => {
  const [analyses, setAnalyses] = useState<DatasetAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<DatasetAnalysis | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [sortField, setSortField] = useState<'dataset' | 'createdAt' | 'updatedAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllAnalyses(100);
      setAnalyses(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analyses');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (analysis: DatasetAnalysis) => {
    setSelectedAnalysis(analysis);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedAnalysis) return;

    try {
      setDeleteLoading(true);
      await deleteAnalysis(selectedAnalysis._id);
      setAnalyses(analyses.filter((a) => a._id !== selectedAnalysis._id));
      setDeleteConfirmOpen(false);
      setSelectedAnalysis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete analysis');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
  };

  const handleEditClick = (analysis: DatasetAnalysis) => {
    setSelectedAnalysis(analysis);
    setNewDatasetName(analysis.dataset);
    setEditDialogOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!selectedAnalysis || !newDatasetName.trim()) return;

    try {
      setEditLoading(true);
      await updateAnalysis(selectedAnalysis._id, {
        dataset: newDatasetName.trim(),
        data: selectedAnalysis.data
      });
      
      // Update the local state
      setAnalyses(analyses.map(a => 
        a._id === selectedAnalysis._id 
          ? { ...a, dataset: newDatasetName.trim() }
          : a
      ));
      
      setEditDialogOpen(false);
      setSelectedAnalysis(null);
      setNewDatasetName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update analysis');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setSelectedAnalysis(null);
    setNewDatasetName('');
  };

  const handleSort = (field: 'dataset' | 'createdAt' | 'updatedAt') => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending except for dates which default to descending
      setSortField(field);
      setSortDirection(field === 'createdAt' || field === 'updatedAt' ? 'desc' : 'asc');
    }
  };

  const sortedAnalyses = React.useMemo(() => {
    return [...analyses].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'dataset':
          aValue = a.dataset.toLowerCase();
          bValue = b.dataset.toLowerCase();
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [analyses, sortField, sortDirection]);

  if (loading) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {selectedAnalysisIds.size > 1 && (
            <Button
              variant="contained"
              startIcon={<CompareIcon />}
              onClick={onCompareSelected}
              color="primary"
              size="small"
            >
              Compare
            </Button>
          )}
        </Box>
      </Box>

      {/* Bulk Selection UI */}
      {selectedAnalysisIds.size > 0 && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {selectedAnalysisIds.size} analysis(es) selected
          </Typography>
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell padding="checkbox" sx={{ fontWeight: 'bold' }}>
                <Checkbox
                  indeterminate={
                    selectedAnalysisIds.size > 0 && selectedAnalysisIds.size < sortedAnalyses.length
                  }
                  checked={sortedAnalyses.length > 0 && selectedAnalysisIds.size === sortedAnalyses.length}
                  onChange={() => {
                    if (selectedAnalysisIds.size === sortedAnalyses.length) {
                      // Deselect all
                      onSelectAll?.([]);
                    } else {
                      // Select all
                      onSelectAll?.(sortedAnalyses.map(a => a._id));
                    }
                  }}
                  disabled={sortedAnalyses.length === 0}
                />
              </TableCell>
              <TableCell sx={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('dataset')}>
                <Box sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  Dataset
                  {sortField === 'dataset' && (
                    sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                  )}
                </Box>
              </TableCell>
              <TableCell sx={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('createdAt')}>
                <Box sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  Created At
                  {sortField === 'createdAt' && (
                    sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                  )}
                </Box>
              </TableCell>
              <TableCell sx={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('updatedAt')}>
                <Box sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  Updated At
                  {sortField === 'updatedAt' && (
                    sortDirection === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />
                  )}
                </Box>
              </TableCell>
              <TableCell align="center">
                <strong>Actions</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedAnalyses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No analyses found
                </TableCell>
              </TableRow>
            ) : (
              sortedAnalyses.map((analysis) => (
                <TableRow
                  key={analysis._id}
                  hover
                  selected={selectedAnalysisIds.has(analysis._id)}
                  component={Link}
                  to={`/analysis/${analysis._id}`}
                  sx={{
                    backgroundColor: selectedAnalysisIds.has(analysis._id)
                      ? 'rgba(25, 118, 210, 0.08)'
                      : 'inherit',
                    cursor: 'pointer',
                    textDecoration: 'none',
                    color: 'inherit'
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedAnalysisIds.has(analysis._id)}
                      onChange={() => onSelectAnalysis(analysis._id)}
                    />
                  </TableCell>
                  <TableCell>{analysis.dataset}</TableCell>
                  <TableCell>{new Date(analysis.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(analysis.updatedAt).toLocaleString()}</TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit dataset name">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(analysis);
                        }}
                        disabled={deleteLoading}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete analysis">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(analysis);
                        }}
                        disabled={deleteLoading}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={handleCancelDelete}>
        <DialogTitle>Delete Analysis</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this analysis?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? <CircularProgress size={24} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dataset Name Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Dataset Name</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Dataset Name"
            fullWidth
            variant="outlined"
            value={newDatasetName}
            onChange={(e) => setNewDatasetName(e.target.value)}
            disabled={editLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditCancel} disabled={editLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleEditConfirm}
            variant="contained"
            disabled={editLoading || !newDatasetName.trim()}
          >
            {editLoading ? <CircularProgress size={24} /> : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AnalysisTable;
