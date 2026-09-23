import { useWriteCapabilities } from './useWriteCapabilities';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material';
import { Comparison } from '@/types';
import { comparisonService } from '@/services/comparisonService';
import { trainingService } from '@/services/trainingService';

export const useComparisonsPage = () => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [comparisonToDelete, setComparisonToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [comparisonToEdit, setComparisonToEdit] = useState<Comparison | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const [trainingData, setTrainingData] = useState<Record<string, string>>({});
  const [loadingTrainings, setLoadingTrainings] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'createdAt' | 'itemCount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading,
    error: loadError,
    refetch: loadComparisons
  } = useQuery({
    queryKey: ['comparisons', sortBy, sortOrder, page, rowsPerPage],
    queryFn: () =>
      comparisonService.getComparisons({
        page: page + 1,
        limit: rowsPerPage,
        sortBy,
        order: sortOrder
      })
  });

  const comparisons = useMemo(() => data?.data.comparisons || [], [data]);

  const error = actionError || (loadError ? 'Failed to load comparisons' : null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => comparisonService.deleteComparison(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      setDeleteDialogOpen(false);
      setComparisonToDelete(null);
    },
    onError: (err) => {
      setActionError('Failed to delete comparison');
      console.error('Error deleting comparison:', err);
    }
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; name: string; description: string; itemIds: string[] }) =>
      comparisonService.updateComparison(vars.id, {
        name: vars.name,
        description: vars.description,
        itemIds: vars.itemIds
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      setEditDialogOpen(false);
      setComparisonToEdit(null);
      setEditName('');
      setEditDescription('');
      setEditSelectedIds([]);
      setTrainingData({});
    },
    onError: (err) => {
      console.error('Error updating comparison:', err);
      setActionError('Failed to update comparison');
    }
  });

  const handleSort = (column: 'name' | 'type' | 'createdAt' | 'itemCount') => {
    if (sortBy === column) {
      // Toggle sort order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort column with default order
      setSortBy(column);
      setSortOrder(column === 'createdAt' ? 'desc' : 'asc'); // Default to desc for dates
    }
    setPage(0);
  };

  const handleChangePage = (_event: unknown, newPage: number) => setPage(newPage);

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDeleteComparison = (id: string) => {
    setComparisonToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!comparisonToDelete) return;
    deleteMutation.mutate(comparisonToDelete);
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setComparisonToDelete(null);
  };

  // Check if user has permission to delete comparisons (owner or admin role)
  const canDeleteComparisons = useWriteCapabilities('comparison', comparisons.map(row => row._id));

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
        // Just this comparison's members, by id.
        const response = await trainingService.getTrainings({
          ids: comparison.itemIds,
          limit: comparison.itemIds.length
        });

        const trainings = response.data.trainings || [];
        const trainingMap: Record<string, string> = {};

        trainings.forEach((training) => {
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
    updateMutation.mutate({
      id: comparisonToEdit._id,
      name: editName.trim(),
      description: editDescription.trim(),
      itemIds: editSelectedIds
    });
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
    totalComparisons: data?.data.pagination?.total ?? comparisons.length,
    page,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
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
    updating: updateMutation.isPending,
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
