import { useState } from 'react';
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  const handleEditTraining = async () => {
    if (!training) return;

    try {
      setEditLoadingConfigs(true);
      setEditLoadingDatasets(true);
      setEditLoadingProjects(true);

      // Load configs, datasets, and projects
      const [configsRes, analysisRes, projectsRes] = await Promise.all([
        configService.getAllConfigs(),
        getAllAnalyses(100, 0),
        projectService.getProjects()
      ]);

      setEditConfigs(configsRes.data.configs || []);
      setEditDatasets(analysisRes.data || []);
      setEditProjects(projectsRes.data || []);

      // Load available tags
      const allTrainings = await trainingService.getTrainings({
        page: 1,
        limit: 1000
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

    try {
      setIsUpdating(true);
      setUpdateError(null);
      setUpdateSuccess(null);

      await trainingService.updateTraining(training._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        configId: editConfigId || undefined,
        datasetId: editDatasetId || undefined,
        projectId: editProjectId || undefined,
        status: editStatus,
        tags: editTags,
      });
      setUpdateSuccess('Training updated successfully');
      refetch();
      setEditDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update training';
      setUpdateError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditConfigId('');
    setEditDatasetId('');
    setEditStatus('pending');
    setEditTags([]);
    setUpdateError(null);
    setUpdateSuccess(null);
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
    isUpdating,
    updateError,
    updateSuccess
  };
};
