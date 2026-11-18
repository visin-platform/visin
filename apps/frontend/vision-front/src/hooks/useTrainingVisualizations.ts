import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { visualizationService } from '../services/visualizationService';
import { Visualization, VisualizationsPaginatedResponse } from '../types';

/** Images a page: four rows of a desktop grid. */
const PAGE_SIZE = 24;

interface UseTrainingVisualizationsProps {
  training_uuid: string;
}

export const useTrainingVisualizations = ({ training_uuid }: UseTrainingVisualizationsProps) => {
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedEpochFilter, setSelectedEpochFilter] = useState<string>('all');
  const [selectedImageName, setSelectedImageName] = useState<string>('');
  const [page, setPage] = useState(1);
  // What is typed is searched once typing pauses, not on every key.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(selectedImageName.trim()), 300);
    return () => clearTimeout(timer);
  }, [selectedImageName]);
  // A new filter starts from its first page.
  useEffect(() => setPage(1), [selectedType, selectedEpochFilter, search]);
  const epoch = selectedEpochFilter !== 'all' && selectedEpochFilter.trim() !== '' ? Number(selectedEpochFilter) : undefined;

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
    // Filtered and paged by the server: a run may hold thousands of images, and a search must reach all of them.
    queryKey: ['visualizations', training_uuid, selectedType, epoch, search, page],
    queryFn: () =>
      visualizationService.getVisualizationsByTraining(training_uuid, {
        type: selectedType !== 'all' ? selectedType : undefined,
        ...(epoch !== undefined && Number.isInteger(epoch) && epoch >= 0 ? { epoch } : {}),
        ...(search ? { search } : {}),
        page,
        limit: PAGE_SIZE
      }) as Promise<VisualizationsPaginatedResponse>,
    placeholderData: (previous) => previous
  });

  const { data: typesData } = useQuery({
    queryKey: ['visualization-types', training_uuid],
    queryFn: () => visualizationService.getVisualizationTypes({ training_uuid })
  });

  const visualizations: Visualization[] = visualizationsData?.data.visualizations || [];
  const pages = visualizationsData?.data.pagination?.pages ?? 0;
  const total = visualizationsData?.data.pagination?.total ?? visualizations.length;

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
    page,
    setPage,
    pages,
    total,
    uploading: uploadMutation.isPending,
    handleUpload,
    handleDelete,
    refresh: loadVisualizations
  };
};
