import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { visualizationService } from '../services/visualizationService';
import { Visualization, VisualizationsPaginatedResponse } from '../types';

interface UseTrainingVisualizationsProps {
  training_uuid: string;
}

export const useTrainingVisualizations = ({ training_uuid }: UseTrainingVisualizationsProps) => {
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedEpochFilter, setSelectedEpochFilter] = useState<string>('all');
  const [selectedImageName, setSelectedImageName] = useState<string>('');

  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['visualizations', training_uuid] });
    queryClient.invalidateQueries({ queryKey: ['visualization-types', training_uuid] });
  };

  const {
    data: visualizationsData,
    isLoading: loadingVisualizations,
    refetch: loadVisualizations
  } = useQuery({
    queryKey: ['visualizations', training_uuid, selectedType],
    queryFn: () =>
      visualizationService.getVisualizationsByTraining(training_uuid, {
        type: selectedType !== 'all' ? selectedType : undefined,
        limit: 100
      }) as Promise<VisualizationsPaginatedResponse>
  });

  const { data: typesData } = useQuery({
    queryKey: ['visualization-types', training_uuid],
    queryFn: () => visualizationService.getVisualizationTypes({ training_uuid })
  });

  const visualizations = useMemo(() => {
    let result = visualizationsData?.data.visualizations || [];

    // Apply client-side filters
    if (selectedEpochFilter !== 'all') {
      const epochNum = parseInt(selectedEpochFilter);
      result = result.filter((viz: Visualization) => viz.epoch === epochNum);
    }

    if (selectedImageName.trim()) {
      const searchTerm = selectedImageName.toLowerCase().trim();
      result = result.filter((viz: Visualization) => viz.filename.toLowerCase().includes(searchTerm));
    }

    return result;
  }, [visualizationsData, selectedEpochFilter, selectedImageName]);

  const types = typesData?.data.types || [];

  const uploadMutation = useMutation({
    mutationFn: ({ selectedEpoch, selectedFile, uploadType }: { selectedEpoch: string; selectedFile: File; uploadType: string }) =>
      visualizationService.uploadVisualization(selectedEpoch, selectedFile, uploadType),
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => {
      console.error('Failed to upload visualization:', err);
      setError('Failed to upload visualization');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (visualization_uuid: string) => visualizationService.deleteVisualization(visualization_uuid),
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => {
      console.error('Failed to delete visualization:', err);
      setError('Failed to delete visualization');
    }
  });

  // Handle upload
  const handleUpload = async (selectedEpoch: string, selectedFile: File, uploadType: string) => {
    setError(null);
    try {
      await uploadMutation.mutateAsync({ selectedEpoch, selectedFile, uploadType });
      return true;
    } catch {
      return false;
    }
  };

  // Handle delete
  const handleDelete = async (visualization_uuid: string) => {
    try {
      await deleteMutation.mutateAsync(visualization_uuid);
      return true;
    } catch {
      return false;
    }
  };

  return {
    visualizations,
    loading: loadingVisualizations,
    error,
    setError,
    selectedType,
    setSelectedType,
    selectedEpochFilter,
    setSelectedEpochFilter,
    selectedImageName,
    setSelectedImageName,
    types,
    uploading: uploadMutation.isPending,
    handleUpload,
    handleDelete,
    refresh: loadVisualizations
  };
};
