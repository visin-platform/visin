import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
  alpha
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  DeleteOutline as DeleteOutlineIcon,
  Compare as CompareIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { projectService } from '../services/projectService';
import { getAllAnalyses, type DatasetAnalysis } from '../services/analysisService';
import { Training, Config } from '../types';
import { Project } from '../types/Project';
import TrainingsTable from '../components/TrainingsTable';
import TrainingFilters from '../components/TrainingFilters';
import TrainingStats from '../components/TrainingStats';
import TrainingFormDialog from '../components/TrainingFormDialog';
import { exportTrainingsToCSV } from '../utils/csvExport';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';

const TrainingsPage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Set page title
  usePageTitle('Trainings - Vision');
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
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<Training['status']>('pending');
  const [trainingTags, setTrainingTags] = useState<string[]>([]);
  const [datasets, setDatasets] = useState<DatasetAnalysis[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTrainingId, setDeleteTrainingId] = useState<string | null>(null);
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<string>>(new Set());
  const [deleteMultipleDialogOpen, setDeleteMultipleDialogOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);

  // Initialize selectedTags and excludedTags from URL parameters
  React.useEffect(() => {
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
  React.useEffect(() => {
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
  React.useEffect(() => {
    setPage(0);
  }, [excludedTags]);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load configs and datasets when modal opens
  React.useEffect(() => {
    if (createModalOpen) {
      const loadData = async () => {
        try {
          setLoadingConfigs(true);
          setLoadingDatasets(true);
          setLoadingProjects(true);
          
          const [configsRes, analysisRes, projectsRes] = await Promise.all([
            configService.getAllConfigs(),
            getAllAnalyses(100, 0),
            projectService.getProjects()
          ]);
          
          setConfigs(configsRes.data.configs || []);
          setDatasets(analysisRes.data || []);
          setProjects(projectsRes.data || []);
        } catch (err) {
          console.error('Failed to load configs/datasets/projects:', err);
          setConfigs([]);
          setDatasets([]);
          setProjects([]);
        } finally {
          setLoadingConfigs(false);
          setLoadingDatasets(false);
          setLoadingProjects(false);
        }
      };
      loadData();
    }
  }, [createModalOpen]);

  // Determine if we need to fetch all data for frontend filtering
  const shouldFetchAll = excludedTags.length > 0;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: shouldFetchAll 
      ? ['trainings-all', debouncedSearch, sortBy, sortOrder, selectedTags, excludedTags]
      : ['trainings', page + 1, rowsPerPage, debouncedSearch, sortBy, sortOrder, selectedTags],
    queryFn: () => {
      if (shouldFetchAll) {
        // Fetch all trainings for frontend filtering and pagination
        return trainingService.getTrainings({
          page: 1,
          limit: 10000, // Large limit to get all trainings
          search: debouncedSearch || undefined,
          sortBy,
          order: sortOrder,
          tags: selectedTags.length > 0 ? selectedTags : undefined
        });
      } else {
        // Normal paginated query
        return trainingService.getTrainings({
          page: page + 1,
          limit: rowsPerPage,
          search: debouncedSearch || undefined,
          sortBy,
          order: sortOrder,
          tags: selectedTags.length > 0 ? selectedTags : undefined
        });
      }
    }
  });

  const { data: statsData } = useQuery({
    queryKey: ['training-stats', selectedTags],
    queryFn: () => trainingService.getTrainingStats({
      tags: selectedTags.length > 0 ? selectedTags : undefined
    })
  });

  // Load available tags
  const loadTags = React.useCallback(async () => {
    try {
      const allTrainings = await trainingService.getTrainings({
        page: 1,
        limit: 1000 // Get a large number to collect all tags
      });
      const tags = new Set<string>();
      allTrainings.data.trainings.forEach((training: Training) => {
        if (training.tags) {
          training.tags.forEach(tag => tags.add(tag));
        }
      });
      setAvailableTags(Array.from(tags).sort());
    } catch (err) {
      console.error('Failed to load tags:', err);
      setAvailableTags([]);
    }
  }, []);

  React.useEffect(() => {
    loadTags();
  }, [loadTags]);

  const allTrainings = data?.data?.trainings || [];
  const backendTotal = data?.data?.pagination?.total || 0;
  const stats = statsData?.data;

  // Filter out trainings that have excluded tags
  const filteredTrainings = React.useMemo(() => {
    let trainingsToFilter = allTrainings;
    
    // If we're fetching all data, we need to filter from the full dataset
    // If we're using backend pagination, the data is already filtered by selectedTags
    if (excludedTags.length === 0) {
      return shouldFetchAll ? allTrainings : trainingsToFilter;
    }
    
    return trainingsToFilter.filter((training: Training) => {
      if (!training.tags) return true;
      return !excludedTags.some(excludedTag => training.tags!.includes(excludedTag));
    });
  }, [allTrainings, excludedTags, shouldFetchAll]);

  // Apply frontend pagination when fetching all data
  const paginatedTrainings = React.useMemo(() => {
    if (!shouldFetchAll) {
      return filteredTrainings;
    }
    const startIndex = page * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return filteredTrainings.slice(startIndex, endIndex);
  }, [filteredTrainings, page, rowsPerPage, shouldFetchAll]);

  // Calculate total count for pagination
  const totalCount = React.useMemo(() => {
    return shouldFetchAll ? filteredTrainings.length : backendTotal;
  }, [shouldFetchAll, filteredTrainings.length, backendTotal]);

  // Use paginated trainings for display
  const displayTrainings = shouldFetchAll ? paginatedTrainings : filteredTrainings;

  // CSV Export function
  const exportToCSV = () => {
    const selectedTrainings = filteredTrainings.filter((training: Training) => selectedTrainingIds.has(training._id));
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
      // Toggle sort order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to descending
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(0); // Reset to first page when sorting changes
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
        // Update existing training
        await trainingService.updateTraining(editingTrainingId, {
          name: trainingName.trim(),
          description: trainingDescription.trim() || undefined,
          datasetId: selectedDatasetId || undefined,
          configId: selectedConfigId || undefined,
          projectId: selectedProjectId || undefined,
          status: selectedStatus,
          tags: trainingTags,
        });
        setCreateSuccess('Training updated successfully!');
      } else {
        // Create new training
        await trainingService.createTraining({
          name: trainingName.trim(),
          description: trainingDescription.trim() || undefined,
          datasetId: selectedDatasetId || undefined,
          configId: selectedConfigId || undefined,
          projectId: selectedProjectId || undefined,
          status: selectedStatus,
          tags: trainingTags,
        });
        setCreateSuccess(`Training "${trainingName}" created successfully!`);
      }

      // Close modal immediately and refresh
      setCreateModalOpen(false);
      setEditingTrainingId(null);
      setTrainingName('');
      setTrainingDescription('');
      setSelectedDatasetId('');
      setSelectedConfigId('');
      setSelectedProjectId('');
      refetch();
      // Refresh available tags to include any new tags that were added
      loadTags();
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
      setSelectedConfigId('');
      setSelectedProjectId('');
      setSelectedStatus('pending');
      setTrainingTags([]);
      setCreateError(null);
      setCreateSuccess(null);
      setEditingTrainingId(null);
    }
  };

  const handleEditTraining = async (training: Training) => {
    try {
      setLoadingConfigs(true);
      setLoadingDatasets(true);
      setLoadingProjects(true);

      // Load configs and datasets
      const [configsRes, analysisRes, projectsRes] = await Promise.all([
        configService.getAllConfigs(),
        getAllAnalyses(100, 0),
        projectService.getProjects()
      ]);

      setConfigs(configsRes.data.configs || []);
      setDatasets(analysisRes.data || []);
      setProjects(projectsRes.data || []);

      // Populate form with training data
      setEditingTrainingId(training._id);
      setTrainingName(training.name);
      setTrainingDescription(training.description || '');
      setSelectedDatasetId(training.datasetId || '');
      setSelectedConfigId(training.configId || '');
      setSelectedProjectId(training.projectId || '');
      setSelectedStatus(training.status);
      setTrainingTags(training.tags || []);
      setCreateModalOpen(true);
    } catch (err) {
      console.error('Failed to load data for editing:', err);
    } finally {
      setLoadingConfigs(false);
      setLoadingDatasets(false);
      setLoadingProjects(false);
    }
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
      setDeleteDialogOpen(false);
      setDeleteTrainingId(null);
      setTimeout(() => {
        refetch();
        // Refresh available tags in case some tags are no longer used
        loadTags();
      }, 500);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to delete training');
    } finally {
      setCreating(false);
    }
  };

  // Handle checkbox change
  const handleSelectTraining = (trainingId: string) => {
    const newSelected = new Set(selectedTrainingIds);
    if (newSelected.has(trainingId)) {
      newSelected.delete(trainingId);
    } else {
      newSelected.add(trainingId);
    }
    setSelectedTrainingIds(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedTrainingIds.size === displayTrainings.length) {
      setSelectedTrainingIds(new Set());
    } else {
      setSelectedTrainingIds(new Set(displayTrainings.map((t: Training) => t._id)));
    }
  };

  // Handle compare selected
  const handleCompareSelected = () => {
    const selectedIds = Array.from(selectedTrainingIds);
    if (selectedIds.length > 1) {
      navigate(`/trainings/compare?ids=${selectedIds.join(',')}`);
    }
  };

  // Handle delete selected
  const handleDeleteSelected = async () => {
    try {
      setCreating(true);
      const trainingsToDelete = Array.from(selectedTrainingIds);
      
      for (const trainingId of trainingsToDelete) {
        await trainingService.deleteTraining(trainingId);
      }
      
      setCreateSuccess(`${trainingsToDelete.length} training(s) deleted successfully!`);
      setDeleteMultipleDialogOpen(false);
      setSelectedTrainingIds(new Set());
      setTimeout(() => {
        refetch();
        // Refresh available tags in case some tags are no longer used
        loadTags();
      }, 500);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to delete trainings');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Training Runs
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage and monitor your model training sessions
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                // Reset form state for new training creation
                setTrainingName('');
                setTrainingDescription('');
                setSelectedDatasetId('');
                setSelectedConfigId('');
                setSelectedProjectId('');
                setSelectedStatus('pending');
                setTrainingTags([]);
                setCreateError(null);
                setCreateSuccess(null);
                setEditingTrainingId(null);
                setCreateModalOpen(true);
              }}
              sx={{ 
                px: 3,
                py: 1,
              borderRadius: 2,
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`
            }}
          >
            New Training
          </Button>
          )}
          <IconButton 
            onClick={() => refetch()} 
            disabled={isLoading}
            sx={{ 
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 2,
              '&:hover': { bgcolor: theme.palette.action.hover }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Training Statistics */}
      {stats && (
        <TrainingStats stats={stats} selectedTags={selectedTags} />
      )}

      <TrainingFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        excludedTags={excludedTags}
        onExcludedTagsChange={setExcludedTags}
        availableTags={availableTags}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load training runs'}
        </Alert>
      )}

      {/* Bulk Actions Bar */}
      {selectedTrainingIds.size > 0 && (
        <Box 
          sx={{ 
            mb: 2, 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
            borderRadius: 2
          }}
        >
          <Typography variant="body2" fontWeight={600} color="primary">
            {selectedTrainingIds.size} selected
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportToCSV}
            size="small"
            sx={{ borderRadius: 2 }}
          >
            Export CSV
          </Button>
          {selectedTrainingIds.size > 1 && (
            <Button
              variant="contained"
              startIcon={<CompareIcon />}
              onClick={handleCompareSelected}
              color="primary"
              size="small"
              sx={{ borderRadius: 2 }}
            >
              Compare
            </Button>
          )}
          {isAuthenticated && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => setDeleteMultipleDialogOpen(true)}
              sx={{ borderRadius: 2 }}
            >
              Delete
            </Button>
          )}
        </Box>
      )}

      <TrainingsTable
        trainings={displayTrainings}
        isLoading={isLoading}
        page={page}
        rowsPerPage={rowsPerPage}
        total={totalCount}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        onEdit={handleEditTraining}
        onDelete={handleDeleteClick}
        searchTerm={searchTerm}
        selectedTrainingIds={selectedTrainingIds}
        onSelectTraining={handleSelectTraining}
        onSelectAll={handleSelectAll}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        isAuthenticated={isAuthenticated}
      />

      {/* Create/Edit Training Modal */}
      <TrainingFormDialog
        open={createModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleCreateTraining}
        isEditing={!!editingTrainingId}
        isCreating={creating}
        isLoadingData={loadingConfigs || loadingDatasets || loadingProjects}
        trainingName={trainingName}
        onNameChange={setTrainingName}
        trainingDescription={trainingDescription}
        onDescriptionChange={setTrainingDescription}
        selectedConfigId={selectedConfigId}
        onConfigChange={setSelectedConfigId}
        selectedDatasetId={selectedDatasetId}
        onDatasetChange={setSelectedDatasetId}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        trainingTags={trainingTags}
        onTagsChange={setTrainingTags}
        availableTags={availableTags}
        configs={configs}
        datasets={datasets}
        projects={projects}
        error={createError}
        success={createSuccess}
        loadingConfigs={loadingConfigs}
        loadingDatasets={loadingDatasets}
        loadingProjects={loadingProjects}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Delete Training</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this training? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button 
            onClick={() => setDeleteDialogOpen(false)} 
            disabled={creating}
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={creating}
            sx={{ borderRadius: 2 }}
          >
            {creating ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Multiple Confirmation Dialog */}
      <Dialog
        open={deleteMultipleDialogOpen}
        onClose={() => setDeleteMultipleDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Delete Selected Trainings</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {selectedTrainingIds.size} training(s)? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button 
            onClick={() => setDeleteMultipleDialogOpen(false)} 
            disabled={creating}
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteSelected}
            color="error"
            variant="contained"
            disabled={creating}
            sx={{ borderRadius: 2 }}
          >
            {creating ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TrainingsPage;
