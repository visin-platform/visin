import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ImageCategory,
  createImageCategory,
  updateImageCategory,
  deleteImageCategory
} from '../services/imageCategoryService';

interface CategoryForm {
  name: string;
  description: string;
  color: string;
}

const emptyForm: CategoryForm = { name: '', description: '', color: '#1976d2' };

export function useDatasetCategoryManager(datasetId: string | undefined) {
  const queryClient = useQueryClient();
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ImageCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyForm);
  const [categoryAlert, setCategoryAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showCategoryAlert = (type: 'success' | 'error', message: string) => {
    setCategoryAlert({ type, message });
    setTimeout(() => setCategoryAlert(null), 5000);
  };

  const closeCategoryModal = () => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
    setCategoryForm(emptyForm);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      showCategoryAlert('error', 'Category name is required');
      return;
    }

    try {
      if (editingCategory) {
        await updateImageCategory(editingCategory._id, {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
          color: categoryForm.color
        });
        showCategoryAlert('success', 'Category updated successfully');
      } else {
        await createImageCategory({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
          datasetId: datasetId!,
          color: categoryForm.color
        });
        showCategoryAlert('success', 'Category created successfully');
      }
      closeCategoryModal();
      queryClient.invalidateQueries({ queryKey: ['datasetCategories', datasetId] });
    } catch {
      showCategoryAlert('error', `Failed to ${editingCategory ? 'update' : 'create'} category`);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteImageCategory(categoryId);
      showCategoryAlert('success', 'Category deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['datasetCategories', datasetId] });
    } catch {
      showCategoryAlert('error', 'Failed to delete category');
    }
  };

  const openEditCategoryModal = (category: ImageCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      color: category.color || '#1976d2'
    });
    setCategoryModalOpen(true);
  };

  return {
    categoryModalOpen,
    setCategoryModalOpen,
    editingCategory,
    categoryForm,
    setCategoryForm,
    categoryAlert,
    showCategoryAlert,
    closeCategoryModal,
    handleSaveCategory,
    handleDeleteCategory,
    openEditCategoryModal
  };
}
