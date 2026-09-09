import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DatasetImage, ImageCondition, updateDatasetImage } from '../services/datasetImageService';

export function useDatasetImageEditor(datasetId: string | undefined, onSuccess: (message: string) => void, onError: (message: string) => void) {
  const queryClient = useQueryClient();
  const [editingImage, setEditingImage] = useState<DatasetImage | null>(null);
  const [editImageModalOpen, setEditImageModalOpen] = useState(false);
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<string>('');
  const [selectedTagsForEdit, setSelectedTagsForEdit] = useState<string>('');
  const [selectedConditionForEdit, setSelectedConditionForEdit] = useState<ImageCondition>('');

  const closeEditImageModal = () => {
    setEditImageModalOpen(false);
    setEditingImage(null);
  };

  const handleEditImageCategory = (image: DatasetImage) => {
    setEditingImage(image);
    setSelectedCategoryForEdit(image.categoryId || '');
    setSelectedTagsForEdit(image.tags.join(', '));
    setSelectedConditionForEdit(image.condition || '');
    setEditImageModalOpen(true);
  };

  const handleSaveImageCategory = async () => {
    if (!editingImage) return;
    try {
      const tags = selectedTagsForEdit
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      await updateDatasetImage(editingImage._id, {
        categoryId: selectedCategoryForEdit || undefined,
        tags: tags,
        condition: selectedConditionForEdit || undefined
      });
      onSuccess('Image updated successfully');
      closeEditImageModal();
      queryClient.invalidateQueries({ queryKey: ['datasetImages', datasetId] });
    } catch {
      onError('Failed to update image');
    }
  };

  return {
    editingImage,
    editImageModalOpen,
    selectedCategoryForEdit,
    setSelectedCategoryForEdit,
    selectedTagsForEdit,
    setSelectedTagsForEdit,
    selectedConditionForEdit,
    setSelectedConditionForEdit,
    closeEditImageModal,
    handleEditImageCategory,
    handleSaveImageCategory
  };
}
