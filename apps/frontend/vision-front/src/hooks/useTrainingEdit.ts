import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { useTrainingTags } from './useTrainingTags';
import { Training } from '../types';

export const useTrainingEdit = (training: Training | undefined, refetch: () => void) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDatasetId, setEditDatasetId] = useState('');
  const [editStatus, setEditStatus] = useState<Training['status']>('pending');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editProjectId, setEditProjectId] = useState('');

  // Both only feed pickers inside the dialog, so they load once it is open and
  // the dialog renders its own loading state meanwhile. Opening used to await
  // all of this — projects, every dataset analysis, and 1000 trainings to
  // collect their tags — before the dialog appeared at all.
  const { data: projectsData, isLoading: editLoadingProjects } = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => projectService.getProjects(),
    staleTime: 5 * 60 * 1000,
    enabled: editDialogOpen
  });
  const { availableTags } = useTrainingTags(editDialogOpen);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!training) throw new Error('No training to update');
      return trainingService.updateTraining(training._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        // Unchanged by this form — sent back as it came so an edit of the name
        // does not clear what the pipeline reported.
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

  const handleEditTraining = () => {
    if (!training) return;

    setEditName(training.name);
    setEditDescription(training.description || '');
    setEditDatasetId(training.datasetId || '');
    setEditProjectId(training.projectId || '');
    setEditStatus(training.status);
    setEditTags(training.tags || []);
    setEditDialogOpen(true);
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
    editProjects: projectsData?.data || [],
    editLoadingProjects,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error instanceof Error ? updateMutation.error.message : (updateMutation.error ? 'Failed to update training' : null),
    updateSuccess: updateMutation.isSuccess ? 'Training updated successfully' : null
  };
};
