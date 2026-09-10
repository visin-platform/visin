import { useWriteCapabilities } from '../../hooks/useWriteCapabilities';
import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography
} from '@mui/material';
import { Compare as CompareIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import TrainingsTable from '../TrainingsTable';
import TrainingFormDialog from '../TrainingFormDialog';
import { trainingService } from '../../services/trainingService';
import { projectService } from '../../services/projectService';
import { getAllAnalyses, type DatasetAnalysis } from '../../services/analysisService';
import { Training } from '../../types';
import { Project } from '../../types/Project';

export type TrainingSortColumn = 'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';

interface ProjectTrainingsTabProps {
  projectId: string;
  trainings: Training[];
  isLoading: boolean;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  sortBy: TrainingSortColumn;
  sortOrder: 'asc' | 'desc';
  onSort: (column: TrainingSortColumn) => void;
  isAuthenticated: boolean;
}

const ProjectTrainingsTab: React.FC<ProjectTrainingsTabProps> = ({
  projectId,
  trainings,
  isLoading,
  page,
  rowsPerPage,
  total,
  onPageChange,
  onRowsPerPageChange,
  sortBy,
  sortOrder,
  onSort,
  isAuthenticated
}) => {
  const canWrite = useWriteCapabilities('training', trainings.map(row => row._id));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<string>>(new Set());
  
  // Edit/Delete Dialog States
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [trainingName, setTrainingName] = useState('');
  const [trainingDescription, setTrainingDescription] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [trainingTags, setTrainingTags] = useState<string[]>([]);
  
  const [datasets, setDatasets] = useState<DatasetAnalysis[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [trainingSuccess, setTrainingSuccess] = useState<string | null>(null);
  
  const [deleteTrainingDialogOpen, setDeleteTrainingDialogOpen] = useState(false);
  const [deleteTrainingId, setDeleteTrainingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (trainings && selectedTrainingIds.size === trainings.length) {
      setSelectedTrainingIds(new Set());
    } else {
      const allIds = new Set<string>(trainings.map((t: Training) => t._id) || []);
      setSelectedTrainingIds(allIds);
    }
  };

  const handleCompareSelected = () => {
    const ids = Array.from(selectedTrainingIds);
    if (ids.length > 1) navigate(`/trainings/compare?ids=${ids.join(',')}`);
  };

  const handleEditTraining = async (training: Training) => {
    try {
      setLoadingDatasets(true);
      setLoadingProjects(true);

      const [analysesRes, projectsRes] = await Promise.all([
        getAllAnalyses(100, 0),
        projectService.getProjects()
      ]);

      setDatasets(analysesRes.data || []);
      setProjects(projectsRes.data || []);

      setEditingTrainingId(training._id);
      setTrainingName(training.name);
      setTrainingDescription(training.description || '');
      setSelectedDatasetId(training.datasetId || '');
      setSelectedProjectId(training.projectId || '');
      setSelectedStatus(training.status);
      setTrainingTags(training.tags || []);
      setTrainingModalOpen(true);
    } catch (err) {
      console.error('Failed to load data for editing training:', err);
    } finally {
      setLoadingDatasets(false);
      setLoadingProjects(false);
    }
  };

  const handleSubmitTraining = async () => {
    if (!editingTrainingId) return;
    try {
      setSavingTraining(true);
      await trainingService.updateTraining(editingTrainingId, {
        name: trainingName,
        description: trainingDescription,
        datasetId: selectedDatasetId || undefined,
        projectId: selectedProjectId || undefined,
        status: selectedStatus,
        tags: trainingTags
      });
      setTrainingSuccess('Training updated successfully');
      setTrainingModalOpen(false);
      setEditingTrainingId(null);
      // Refresh trainings list and related stats
      queryClient.invalidateQueries({ queryKey: ['project-trainings-full', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard-stats', projectId] });
    } catch (err) {
      console.error('Failed to update training:', err);
      setTrainingError(err instanceof Error ? err.message : 'Failed to update training');
    } finally {
      setSavingTraining(false);
    }
  };

  const handleDeleteTrainingClick = (trainingId: string) => {
    setDeleteTrainingId(trainingId);
    setDeleteTrainingDialogOpen(true);
  };

  const handleConfirmDeleteTraining = async () => {
    if (!deleteTrainingId) return;
    try {
      setIsDeleting(true);
      await trainingService.deleteTraining(deleteTrainingId);
      setDeleteTrainingDialogOpen(false);
      setDeleteTrainingId(null);
      queryClient.invalidateQueries({ queryKey: ['project-trainings-full', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard-stats', projectId] });
    } catch (err) {
      console.error('Failed to delete training:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Box sx={{ px: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
        {selectedTrainingIds.size > 1 && (
          <Button
            variant="outlined"
            startIcon={<CompareIcon />}
            onClick={handleCompareSelected}
            color="primary"
            size="small"
            sx={{ borderRadius: 2 }}
          >
            Compare Selected ({selectedTrainingIds.size})
          </Button>
        )}
      </Box>
      <TrainingsTable 
        canWrite={canWrite}
        trainings={trainings} 
        isLoading={isLoading}
        page={page}
        rowsPerPage={rowsPerPage}
        total={total}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        onEdit={handleEditTraining}
        onDelete={handleDeleteTrainingClick}
        searchTerm=""
        selectedTrainingIds={selectedTrainingIds}
        onSelectTraining={handleSelectTraining}
        onSelectAll={handleSelectAll}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={onSort}
        isAuthenticated={isAuthenticated}
      />

      {/* Edit Training Dialog */}
      <TrainingFormDialog
        open={trainingModalOpen}
        onClose={() => {
          setTrainingModalOpen(false);
          setEditingTrainingId(null);
          setTrainingName('');
          setTrainingDescription('');
          setSelectedDatasetId('');
          setSelectedProjectId('');
          setSelectedStatus('pending');
          setTrainingTags([]);
          setTrainingError(null);
          setTrainingSuccess(null);
        }}
        onSubmit={handleSubmitTraining}
        isEditing={!!editingTrainingId}
        isCreating={savingTraining}
        isLoadingData={loadingDatasets || loadingProjects}
        trainingName={trainingName}
        onNameChange={setTrainingName}
        trainingDescription={trainingDescription}
        onDescriptionChange={setTrainingDescription}
        selectedDatasetId={selectedDatasetId}
        onDatasetChange={setSelectedDatasetId}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        trainingTags={trainingTags}
        onTagsChange={setTrainingTags}
        availableTags={[]}
        datasets={datasets}
        projects={projects}
        error={trainingError}
        success={trainingSuccess}
        loadingDatasets={loadingDatasets}
        loadingProjects={loadingProjects}
      />

      {/* Delete Training Dialog */}
      <Dialog open={deleteTrainingDialogOpen} onClose={() => setDeleteTrainingDialogOpen(false)}>
        <DialogTitle>Delete Training</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this training? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTrainingDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDeleteTraining}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectTrainingsTab;
