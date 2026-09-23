import { useWriteCapabilities } from './useWriteCapabilities';
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { useTrainingTags } from './useTrainingTags';
import { Training } from '../types';
import { exportTrainingsToCSV } from '../utils/csvExport';
import { useAuth } from '../contexts/AuthContext';

export const useTrainingsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [trainingName, setTrainingName] = useState('');
  const [trainingDescription, setTrainingDescription] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Training['status']>('pending');
  const [trainingTags, setTrainingTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTrainingId, setDeleteTrainingId] = useState<string | null>(null);
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<string>>(new Set());
  const [deleteMultipleDialogOpen, setDeleteMultipleDialogOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);

  // Projects for the create/edit modal — only fetched while the modal is open,
  // and shared between the "create" and "edit" entry points. The dataset is
  // reported by the pipeline, so the form shows it read-only and no longer
  // fetches every analysis to fill a picker.
  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => projectService.getProjects(),
    staleTime: 5 * 60 * 1000,
    enabled: createModalOpen
  });
  const availableProjects = projectsData?.data || [];
  const canEditProject = useWriteCapabilities('project', availableProjects.map(project => project._id));
  const projects = availableProjects.filter(project => canEditProject(project._id));

  // Initialize selectedTags and excludedTags from URL parameters
  useEffect(() => {
    const tagsParam = searchParams.get('tags');
    if (tagsParam) {
      const tags = tagsParam.split(',').filter(tag => tag.trim().length > 0);
      setSelectedTags(tags);
    }
    
    const excludeTagsParam = searchParams.get('excludeTags');
    if (excludeTagsParam) {
      const excludeTags = excludeTagsParam.split(',').filter(tag => tag.trim().length > 0);
      setExcludedTags(excludeTags);
    }
  }, [searchParams]);

  // Update URL parameters when selectedTags or excludedTags changes
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (selectedTags.length > 0) {
      newSearchParams.set('tags', selectedTags.join(','));
    } else {
      newSearchParams.delete('tags');
    }
    if (excludedTags.length > 0) {
      newSearchParams.set('excludeTags', excludedTags.join(','));
    } else {
      newSearchParams.delete('excludeTags');
    }
    setSearchParams(newSearchParams, { replace: true });
  }, [selectedTags, excludedTags, searchParams, setSearchParams]);

  // Reset to first page when exclude tags change
  useEffect(() => {
    setPage(0);
  }, [excludedTags]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Tag exclusion is filtered on the server too, so every view is one page.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trainings', page + 1, rowsPerPage, debouncedSearch, sortBy, sortOrder, selectedTags, excludedTags],
    queryFn: () =>
      trainingService.getTrainings({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        sortBy,
        order: sortOrder,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        excludeTags: excludedTags.length > 0 ? excludedTags : undefined
      })
  });

  const { availableTags, refetchTags } = useTrainingTags();

  const displayTrainings = useMemo(() => data?.data?.trainings || [], [data?.data?.trainings]);
  const totalCount = data?.data?.pagination?.total || 0;

  const canWrite = useWriteCapabilities('training', [...displayTrainings.map(row => row._id), ...selectedTrainingIds]);
  const canDeleteSelected = selectedTrainingIds.size > 0 && [...selectedTrainingIds].every(canWrite);

  // CSV Export function
  const exportToCSV = () => {
    const selectedTrainings = displayTrainings.filter((training: Training) => selectedTrainingIds.has(training._id));
    exportTrainingsToCSV(selectedTrainings);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (column: 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const handleCreateTraining = async () => {
    if (!trainingName.trim()) {
      setCreateError('Training name is required');
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setCreateSuccess(null);

      if (editingTrainingId) {
        await trainingService.updateTraining(editingTrainingId, {
          name: trainingName.trim(),
          description: trainingDescription.trim() || undefined,
          datasetId: selectedDatasetId || undefined,
          projectId: selectedProjectId || undefined,
          status: selectedStatus,
          tags: trainingTags,
        });
        setCreateSuccess('Training updated successfully!');
      } else {
        await trainingService.createTraining({
          name: trainingName.trim(),
          description: trainingDescription.trim() || undefined,
          datasetId: selectedDatasetId || undefined,
          projectId: selectedProjectId || undefined,
          status: selectedStatus,
          tags: trainingTags,
        });
        setCreateSuccess(`Training "${trainingName}" created successfully!`);
      }

      setCreateModalOpen(false);
      setEditingTrainingId(null);
      setTrainingName('');
      setTrainingDescription('');
      setSelectedDatasetId('');
      setSelectedProjectId('');
      refetch();
      refetchTags();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to save training');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseModal = () => {
    if (!creating) {
      setCreateModalOpen(false);
      setTrainingName('');
      setTrainingDescription('');
      setSelectedDatasetId('');
      setSelectedProjectId('');
      setSelectedStatus('pending');
      setTrainingTags([]);
      setCreateError(null);
      setCreateSuccess(null);
      setEditingTrainingId(null);
    }
  };

  const handleEditTraining = (training: Training) => {
    // Opening the modal flips `enabled` on the projects query above, which
    // fetches in the background — the modal already renders a loading state
    // for it via isLoadingData.
    setEditingTrainingId(training._id);
    setTrainingName(training.name);
    setTrainingDescription(training.description || '');
    setSelectedDatasetId(training.datasetId || '');
    setSelectedProjectId(training.projectId || '');
    setSelectedStatus(training.status);
    setTrainingTags(training.tags || []);
    setCreateModalOpen(true);
  };

  const handleDeleteClick = (trainingId: string) => {
    setDeleteTrainingId(trainingId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTrainingId) return;

    try {
      setCreating(true);
      await trainingService.deleteTraining(deleteTrainingId);
      setCreateSuccess('Training deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['trainings-deleted'] });
      setDeleteDialogOpen(false);
      setDeleteTrainingId(null);
      setTimeout(() => {
        refetch();
        refetchTags();
      }, 500);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to delete training');
    } finally {
      setCreating(false);
    }
  };

  const handleSelectTraining = (trainingId: string) => {
    const newSelected = new Set(selectedTrainingIds);
    if (newSelected.has(trainingId)) {
      newSelected.delete(trainingId);
    } else {
      newSelected.add(trainingId);
    }
    setSelectedTrainingIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTrainingIds.size === displayTrainings.length) {
      setSelectedTrainingIds(new Set());
    } else {
      setSelectedTrainingIds(new Set(displayTrainings.map((t: Training) => t._id)));
    }
  };

  const handleCompareSelected = () => {
    const selectedIds = Array.from(selectedTrainingIds);
    if (selectedIds.length > 1) {
      navigate(`/trainings/compare?ids=${selectedIds.join(',')}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (!canDeleteSelected) return;
    try {
      setCreating(true);
      const trainingsToDelete = Array.from(selectedTrainingIds);
      
      for (const trainingId of trainingsToDelete) {
        await trainingService.deleteTraining(trainingId);
      }
      
      setCreateSuccess(`${trainingsToDelete.length} training(s) deleted successfully!`);
      queryClient.invalidateQueries({ queryKey: ['trainings-deleted'] });
      setDeleteMultipleDialogOpen(false);
      setSelectedTrainingIds(new Set());
      setTimeout(() => {
        refetch();
        refetchTags();
      }, 500);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to delete trainings');
    } finally {
      setCreating(false);
    }
  };

  return {
    canWrite,
    canDeleteSelected,
    isAuthenticated,
    page,
    rowsPerPage,
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    createModalOpen,
    setCreateModalOpen,
    trainingName,
    setTrainingName,
    trainingDescription,
    setTrainingDescription,
    selectedDatasetId,
    setSelectedDatasetId,
    selectedProjectId,
    setSelectedProjectId,
    selectedStatus,
    setSelectedStatus,
    trainingTags,
    setTrainingTags,
    projects,
    loadingProjects,
    creating,
    createError,
    createSuccess,
    editingTrainingId,
    deleteDialogOpen,
    setDeleteDialogOpen,
    deleteTrainingId,
    selectedTrainingIds,
    deleteMultipleDialogOpen,
    setDeleteMultipleDialogOpen,
    selectedTags,
    setSelectedTags,
    availableTags,
    excludedTags,
    setExcludedTags,
    isLoading,
    error,
    displayTrainings,
    totalCount,
    exportToCSV,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSort,
    handleCreateTraining,
    handleCloseModal,
    handleEditTraining,
    handleDeleteClick,
    handleConfirmDelete,
    handleSelectTraining,
    handleSelectAll,
    handleCompareSelected,
    handleDeleteSelected
  };
};
