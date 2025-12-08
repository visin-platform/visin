import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  TextField,
  Checkbox,
  Container,
  useTheme,
  alpha
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Edit as EditIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { Comparison } from '@/types';
import { comparisonService } from '@/services/comparisonService';
import { trainingService } from '@/services/trainingService';
import { useAuth } from '../contexts/AuthContext';

const ComparisonsPage: React.FC = () => {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [comparisonToDelete, setComparisonToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [comparisonToEdit, setComparisonToEdit] = useState<Comparison | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [trainingData, setTrainingData] = useState<Record<string, string>>({});
  const [loadingTrainings, setLoadingTrainings] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'createdAt' | 'itemCount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadComparisons();
  }, [sortBy, sortOrder]);

  const handleSort = (column: 'name' | 'type' | 'createdAt' | 'itemCount') => {
    if (sortBy === column) {
      // Toggle sort order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort column with default order
      setSortBy(column);
      setSortOrder(column === 'createdAt' ? 'desc' : 'asc'); // Default to desc for dates
    }
  };

  const loadComparisons = async () => {
    try {
      setLoading(true);
      const response = await comparisonService.getComparisons({
        page: 1,
        limit: 100,
        sortBy: sortBy === 'itemCount' ? 'createdAt' : sortBy, // API doesn't support itemCount sorting
        order: sortOrder,
      });
      let comparisonsData = response.data.comparisons || [];
      
      // Apply client-side sorting for itemCount
      if (sortBy === 'itemCount') {
        comparisonsData = [...comparisonsData].sort((a, b) => {
          const aCount = a.itemIds.length;
          const bCount = b.itemIds.length;
          if (sortOrder === 'asc') {
            return aCount - bCount;
          } else {
            return bCount - aCount;
          }
        });
      }
      
      setComparisons(comparisonsData);
      setError(null);
    } catch (err) {
      console.error('Error loading comparisons:', err);
      setError('Failed to load comparisons');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComparison = (id: string) => {
    setComparisonToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!comparisonToDelete) return;

    try {
      await comparisonService.deleteComparison(comparisonToDelete);
      loadComparisons();
      setDeleteDialogOpen(false);
      setComparisonToDelete(null);
    } catch (err) {
      setError('Failed to delete comparison');
      console.error('Error deleting comparison:', err);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setComparisonToDelete(null);
  };

  // Check if user has permission to delete comparisons (owner or admin role)
  const canDeleteComparisons = () => {
    if (!isAuthenticated || !user) return false;
    return user.groups.some(group => group.includes('owner') || group.includes('admin'));
  };

  const handleEditComparison = async (comparison: Comparison) => {
    setComparisonToEdit(comparison);
    setEditName(comparison.name);
    setEditDescription(comparison.description || '');
    setEditSelectedIds(comparison.itemIds);
    setEditDialogOpen(true);

    // Fetch training data for the comparison items
    if (comparison.type === 'trainings' && comparison.itemIds.length > 0) {
      setLoadingTrainings(true);
      try {
        // For now, fetch all trainings and filter - could be optimized later
        const response = await trainingService.getTrainings({
          page: 1,
          limit: 1000, // Large limit to get all trainings
        });
        
        const trainings = response.data.trainings || [];
        const trainingMap: Record<string, string> = {};
        
        trainings.forEach((training: any) => {
          trainingMap[training._id] = training.name;
        });
        
        setTrainingData(trainingMap);
      } catch (error) {
        console.error('Error fetching training data:', error);
        // Fallback to showing IDs if fetching fails
        const fallbackMap: Record<string, string> = {};
        comparison.itemIds.forEach(id => {
          fallbackMap[id] = id;
        });
        setTrainingData(fallbackMap);
      } finally {
        setLoadingTrainings(false);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setComparisonToEdit(null);
    setEditName('');
    setEditDescription('');
    setEditSelectedIds([]);
    setTrainingData({});
  };

  const handleUpdateComparison = async () => {
    if (!comparisonToEdit || !editName.trim()) return;

    try {
      setUpdating(true);
      await comparisonService.updateComparison(comparisonToEdit._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        itemIds: editSelectedIds,
      });

      loadComparisons();
      setEditDialogOpen(false);
      setComparisonToEdit(null);
      setEditName('');
      setEditDescription('');
      setEditSelectedIds([]);
      setTrainingData({});
    } catch (error) {
      console.error('Error updating comparison:', error);
      setError('Failed to update comparison');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditTrainingIdToggle = (trainingId: string) => {
    setEditSelectedIds(prev =>
      prev.includes(trainingId)
        ? prev.filter(id => id !== trainingId)
        : [...prev, trainingId]
    );
  };

  const handleViewComparison = (comparison: Comparison) => {
    // Navigate based on comparison type
    switch (comparison.type) {
      case 'trainings':
        navigate(`/trainings/compare?ids=${comparison.itemIds.join(',')}`);
        break;
      case 'tests':
        navigate(`/test-results/compare?ids=${comparison.itemIds.join(',')}`);
        break;
      case 'benchmarks':
        // For now, navigate to benchmarks page - could be enhanced later
        navigate('/benchmarks');
        break;
      case 'epochs':
        // For now, navigate to epochs page - could be enhanced later
        navigate('/epochs');
        break;
      default:
        // Default to trainings comparison
        navigate(`/trainings/compare?ids=${comparison.itemIds.join(',')}`);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'trainings':
        return 'primary';
      case 'tests':
        return 'secondary';
      case 'benchmarks':
        return 'success';
      case 'epochs':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading && comparisons.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Comparisons
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Compare and analyze model performance across different test results
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => {
                loadComparisons();
              }}
              sx={{ 
                bgcolor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                '&:hover': { bgcolor: theme.palette.action.hover }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Comparisons Table */}
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
                  onClick={() => handleSort('name')}
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
                  onClick={() => handleSort('type')}
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
                  onClick={() => handleSort('itemCount')}
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
                  onClick={() => handleSort('createdAt')}
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
                onClick={() => handleViewComparison(comparison)}
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
                  <Typography variant="body2" color="text.secondary">
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
                    {canDeleteComparisons() && (
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditComparison(comparison);
                          }}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canDeleteComparisons() && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteComparison(comparison._id);
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

      {comparisons.length === 0 && !loading && (
        <Box textAlign="center" py={6}>
          <Typography variant="h6" color="textSecondary">
            No comparisons found
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Create comparisons from training, test, or benchmark views to see them here
          </Typography>
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCancelDelete}>
        <DialogTitle>Delete Comparison</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this comparison? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Comparison Modal */}
      <Dialog
        open={editDialogOpen}
        onClose={() => !updating && handleCancelEdit()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Edit Comparison
          <IconButton
            onClick={() => !updating && handleCancelEdit()}
            sx={{ position: 'absolute', right: 8, top: 8 }}
            disabled={updating}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Comparison Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              sx={{ mb: 2 }}
              disabled={updating}
              required
            />
            <TextField
              fullWidth
              label="Description (optional)"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              multiline
              rows={3}
              sx={{ mb: 3 }}
              disabled={updating}
            />
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Select items to include in comparison ({editSelectedIds.length} selected):
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflow: 'auto' }}>
              {loadingTrainings ? (
                <Box display="flex" justifyContent="center" py={2}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    Loading training data...
                  </Typography>
                </Box>
              ) : (
                comparisonToEdit?.itemIds.map((itemId) => (
                  <Box key={itemId} sx={{ display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                      checked={editSelectedIds.includes(itemId)}
                      onChange={() => handleEditTrainingIdToggle(itemId)}
                      disabled={updating}
                      id={`edit-training-${itemId}`}
                    />
                    <label
                      htmlFor={`edit-training-${itemId}`}
                      style={{
                        cursor: updating ? 'not-allowed' : 'pointer',
                        opacity: updating ? 0.5 : 1,
                        marginLeft: 8,
                        fontSize: '0.875rem'
                      }}
                    >
                      {trainingData[itemId] || itemId}
                    </label>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCancelEdit}
            disabled={updating}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdateComparison}
            disabled={updating || !editName.trim() || editSelectedIds.length === 0}
            startIcon={updating ? <CircularProgress size={16} /> : <EditIcon />}
          >
            {updating ? 'Updating...' : 'Update Comparison'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ComparisonsPage;