import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material';
import { Comparison } from '@/types';
import { comparisonService } from '@/services/comparisonService';
import { trainingService } from '@/services/trainingService';
import { useAuth } from '../contexts/AuthContext';

export const useComparisonsPage = () => {
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
    // All comparisons now go to training comparison page
    let tab = '';
    if (comparison.type === 'tests') {
      tab = '&tab=tests';
    } else if (comparison.type === 'benchmarks') {
      tab = '&tab=benchmarks';
    }
    navigate(`/trainings/compare?ids=${comparison.itemIds.join(',')}${tab}`);
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

  return {
    comparisons,
    loading,
    error,
    deleteDialogOpen,
    editDialogOpen,
    comparisonToEdit,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editSelectedIds,
    updating,
    trainingData,
    loadingTrainings,
    sortBy,
    sortOrder,
    theme,
    handleSort,
    loadComparisons,
    handleDeleteComparison,
    handleConfirmDelete,
    handleCancelDelete,
    canDeleteComparisons,
    handleEditComparison,
    handleCancelEdit,
    handleUpdateComparison,
    handleEditTrainingIdToggle,
    handleViewComparison,
    formatTimestamp,
    getTypeColor
  };
};
