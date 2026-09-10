import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { getAllAnalyses, type DatasetAnalysis } from '../services/analysisService';
import { Training } from '../types';
import { Project } from '../types/Project';

export const useTrainingEdit = (training: Training | undefined, refetch: () => void) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDatasetId, setEditDatasetId] = useState('');
  const [editStatus, setEditStatus] = useState<Training['status']>('pending');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [editDatasets, setEditDatasets] = useState<DatasetAnalysis[]>([]);
  const [editProjects, setEditProjects] = useState<Project[]>([]);
  const [editLoadingDatasets, setEditLoadingDatasets] = useState(false);
  const [editLoadingProjects, setEditLoadingProjects] = useState(false);
  const [editProjectId, setEditProjectId] = useState('');

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!training) throw new Error('No training to update');
      return trainingService.updateTraining(training._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        datasetId: editDatasetId || undefined,
        projectId: editProjectId || undefined,
        status: editStatus,
        tags: editTags
      });
    },
    onSuccess: () => {
      refetch();
      setEditDialogOpen(false);
    }
  });

  const handleEditTraining = async () => {
    if (!training) return;

    try {
      setEditLoadingDatasets(true);
      setEditLoadingProjects(true);

      // Load datasets and projects (cached across the app under these keys)
      const [analysisRes, projectsRes] = await Promise.all([
        queryClient.fetchQuery({ queryKey: ['dataset-analyses', 100, 0], queryFn: () => getAllAnalyses(100, 0) }),
        queryClient.fetchQuery({ queryKey: ['projects'], queryFn: () => projectService.getProjects() })
      ]);

      setEditDatasets(analysisRes.data || []);
      setEditProjects(projectsRes.data || []);

      // Load available tags
      const allTrainings = await queryClient.fetchQuery({
        queryKey: ['trainings-all-tags'],
        queryFn: () => trainingService.getTrainings({ page: 1, limit: 1000 })
      });
      const tags = new Set<string>();
      allTrainings.data.trainings.forEach((t: Training) => {
        if (t.tags) {
          t.tags.forEach(tag => tags.add(tag));
        }
      });
      setAvailableTags(Array.from(tags).sort());

      // Populate form with training data
      setEditName(training.name);
      setEditDescription(training.description || '');
      setEditDatasetId(training.datasetId || '');
      setEditProjectId(training.projectId || '');
      setEditStatus(training.status);
      setEditTags(training.tags || []);
      setEditDialogOpen(true);
    } catch (err) {
      console.error('Failed to load data for editing:', err);
    } finally {
      setEditLoadingDatasets(false);
      setEditLoadingProjects(false);
    }
  };

  const handleEditConfirm = async () => {
    if (!training || !editName.trim()) return;
    updateMutation.mutate();
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditDatasetId('');
    setEditStatus('pending');
    setEditTags([]);
    updateMutation.reset();
  };

  return {
    editDialogOpen,
    handleEditTraining,
    handleEditConfirm,
    handleEditCancel,
    editName, setEditName,
    editDescription, setEditDescription,
    editDatasetId, setEditDatasetId,
    editProjectId, setEditProjectId,
    editStatus, setEditStatus,
    editTags, setEditTags,
    availableTags,
    editDatasets,
    editProjects,
    editLoadingDatasets,
    editLoadingProjects,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error instanceof Error ? updateMutation.error.message : (updateMutation.error ? 'Failed to update training' : null),
    updateSuccess: updateMutation.isSuccess ? 'Training updated successfully' : null
  };
};
