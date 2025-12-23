import { useState, useEffect, useCallback } from 'react';
import { visualizationService } from '../services/visualizationService';
import { Visualization, PaginatedResponse } from '../types';

interface UseTrainingVisualizationsProps {
  training_uuid: string;
}

export const useTrainingVisualizations = ({ training_uuid }: UseTrainingVisualizationsProps) => {
  const [visualizations, setVisualizations] = useState<Visualization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedEpochFilter, setSelectedEpochFilter] = useState<string>('all');
  const [selectedImageName, setSelectedImageName] = useState<string>('');
  const [types, setTypes] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Load visualizations
  const loadVisualizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await visualizationService.getVisualizationsByTraining(
        training_uuid,
        {
          type: selectedType !== 'all' ? selectedType : undefined,
          limit: 100
        }
      ) as PaginatedResponse<Visualization>;

      let visualizations = response.data.visualizations || [];

      // Apply client-side filters
      if (selectedEpochFilter !== 'all') {
        const epochNum = parseInt(selectedEpochFilter);
        visualizations = visualizations.filter((viz: Visualization) => viz.epoch === epochNum);
      }

      if (selectedImageName.trim()) {
        const searchTerm = selectedImageName.toLowerCase().trim();
        visualizations = visualizations.filter((viz: Visualization) =>
          viz.filename.toLowerCase().includes(searchTerm)
        );
      }

      setVisualizations(visualizations);
    } catch (err) {
      console.error('Failed to load visualizations:', err);
      setError('Failed to load visualizations');
    } finally {
      setLoading(false);
    }
  }, [training_uuid, selectedType, selectedEpochFilter, selectedImageName]);

  // Load visualization types
  const loadTypes = useCallback(async () => {
    try {
      const response = await visualizationService.getVisualizationTypes({ training_uuid });
      setTypes(response.data.types || []);
    } catch (err) {
      console.error('Failed to load visualization types:', err);
    }
  }, [training_uuid]);

  useEffect(() => {
    loadVisualizations();
    loadTypes();
  }, [loadVisualizations, loadTypes]);

  // Handle upload
  const handleUpload = async (
    selectedEpoch: string,
    selectedFile: File,
    uploadType: string
  ) => {
    try {
      setUploading(true);
      setError(null);

      await visualizationService.uploadVisualization(
        selectedEpoch,
        selectedFile,
        uploadType
      );

      loadVisualizations();
      loadTypes();
      return true;
    } catch (err) {
      console.error('Failed to upload visualization:', err);
      setError('Failed to upload visualization');
      return false;
    } finally {
      setUploading(false);
    }
  };

  // Handle delete
  const handleDelete = async (visualization_uuid: string) => {
    try {
      await visualizationService.deleteVisualization(visualization_uuid);
      loadVisualizations();
      loadTypes();
      return true;
    } catch (err) {
      console.error('Failed to delete visualization:', err);
      setError('Failed to delete visualization');
      return false;
    }
  };

  return {
    visualizations,
    loading,
    error,
    setError,
    selectedType,
    setSelectedType,
    selectedEpochFilter,
    setSelectedEpochFilter,
    selectedImageName,
    setSelectedImageName,
    types,
    uploading,
    handleUpload,
    handleDelete,
    refresh: loadVisualizations
  };
};
