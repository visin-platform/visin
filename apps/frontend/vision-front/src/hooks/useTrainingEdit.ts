import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { projectService } from '../services/projectService';
import { getAllAnalyses, type DatasetAnalysis } from '../services/analysisService';
import { Training, Config } from '../types';
import { Project } from '../types/Project';

export const useTrainingEdit = (training: Training | undefined, refetch: () => void) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editConfigId, setEditConfigId] = useState('');
  const [editDatasetId, setEditDatasetId] = useState('');
  const [editStatus, setEditStatus] = useState<Training['status']>('pending');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [editConfigs, setEditConfigs] = useState<Config[]>([]);
  const [editDatasets, setEditDatasets] = useState<DatasetAnalysis[]>([]);
  const [editProjects, setEditProjects] = useState<Project[]>([]);
  const [editLoadingConfigs, setEditLoadingConfigs] = useState(false);
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
        configId: editConfigId || undefined,
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
      setEditLoadingConfigs(true);
      setEditLoadingDatasets(true);
      setEditLoadingProjects(true);

      // Load configs, datasets, and projects (cached across the app under these keys)
      const [configsRes, analysisRes, projectsRes] = await Promise.all([
        queryClient.fetchQuery({ queryKey: ['configs'], queryFn: () => configService.getAllConfigs() }),
        queryClient.fetchQuery({ queryKey: ['dataset-analyses', 100, 0], queryFn: () => getAllAnalyses(100, 0) }),
        queryClient.fetchQuery({ queryKey: ['projects'], queryFn: () => projectService.getProjects() })
      ]);

      setEditConfigs(configsRes.data.configs || []);
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
      setEditConfigId(training.configId || '');
      setEditDatasetId(training.datasetId || '');
      setEditProjectId(training.projectId || '');
      setEditStatus(training.status);
      setEditTags(training.tags || []);
      setEditDialogOpen(true);
    } catch (err) {
      console.error('Failed to load data for editing:', err);
    } finally {
      setEditLoadingConfigs(false);
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
    setEditConfigId('');
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
    editConfigId, setEditConfigId,
    editDatasetId, setEditDatasetId,
    editProjectId, setEditProjectId,
    editStatus, setEditStatus,
    editTags, setEditTags,
    availableTags,
    editConfigs,
    editDatasets,
    editProjects,
    editLoadingConfigs,
    editLoadingDatasets,
    editLoadingProjects,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error instanceof Error ? updateMutation.error.message : (updateMutation.error ? 'Failed to update training' : null),
    updateSuccess: updateMutation.isSuccess ? 'Training updated successfully' : null
  };
};
