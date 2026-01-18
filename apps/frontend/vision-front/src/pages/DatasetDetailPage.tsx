import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Container,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Dialog,
  DialogContent,
  IconButton,
  Button,
  DialogTitle,
  DialogContentText,
  DialogActions,
  useTheme,
  Typography
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { getAnalysisById, updateAnalysis, deleteAnalysis } from '../services/analysisService';
import {
  DatasetImage,
  WeatherCondition,
  deleteDatasetImage,
  updateDatasetImage,
  getCategoriesByDataset,
  ImageCategory,
  createImageCategory,
  updateImageCategory,
  deleteImageCategory,
  getImagesByDataset
} from '../services/datasetImageService';
import { getGlobalConfig } from '../config/ConfigProvider';
import FileUpload from '../components/FileUpload';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { useDatasetImages } from '../hooks/useDatasetImages';

// Components
import DatasetHeader from '../components/dataset/DatasetHeader';
import DatasetInfoTab from '../components/dataset/DatasetInfoTab';
import DatasetCategoriesTab from '../components/dataset/DatasetCategoriesTab';
import DatasetImagesTab from '../components/dataset/DatasetImagesTab';
import DatasetExportTab from '../components/dataset/DatasetExportTab';
import CategoryModal from '../components/dataset/CategoryModal';
import EditImageModal from '../components/dataset/EditImageModal';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';

const DatasetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAuthenticated, user } = useAuth();

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [uploadingJson, setUploadingJson] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<DatasetImage | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  
  // Category management state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ImageCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    color: '#1976d2'
  });
  const [categoryAlert, setCategoryAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // File upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  
  // Image editing state
  const [editingImage, setEditingImage] = useState<DatasetImage | null>(null);
  const [editImageModalOpen, setEditImageModalOpen] = useState(false);
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState<string>('');
  const [selectedTagsForEdit, setSelectedTagsForEdit] = useState<string>('');
  const [selectedWeatherForEdit, setSelectedWeatherForEdit] = useState<WeatherCondition | ''>('');
  
  // Export state
  const [exporting, setExporting] = useState<'good' | 'bad' | 'all' | null>(null);

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getAnalysisById(id!),
    enabled: Boolean(id)
  });

  const {
    data: imagesData,
    isLoading: imagesLoading,
    error: imagesError,
    page: currentPage,
    setPage: setCurrentPage,
    pageSize,
    setPageSize,
    filters,
    updateFilter
  } = useDatasetImages({ datasetId: id! });

  const { data: categoriesData, isLoading: categoriesQueryLoading, error: categoriesError } = useQuery({
    queryKey: ['datasetCategories', id],
    queryFn: () => getCategoriesByDataset(id!),
    enabled: Boolean(id),
    retry: false,
  });

  // Get available tags for this dataset
  const { data: availableTagsData } = useQuery({
    queryKey: ['datasetTags', id],
    queryFn: async () => {
      const response = await getImagesByDataset(id!, 1, 1000, undefined, undefined, undefined, undefined, 'updatedAt', 'desc');
      const allTags = new Set<string>();
      response.data.images.forEach((image: DatasetImage) => {
        image.tags.forEach(tag => allTags.add(tag));
      });
      return Array.from(allTags).sort();
    },
    enabled: Boolean(id),
    retry: false,
  });

  const images = imagesData?.data?.images || [];
  const pagination = imagesData?.data?.pagination || { page: 1, limit: 50, total: 0, pages: 1 };
  const datasetCategories = categoriesData || [];
  const availableTags = availableTagsData || [];

  usePageTitle(analysis ? `Dataset: ${analysis.dataset} - Vision` : 'Dataset Details - Vision');

  const canDeleteDatasets = () => {
    return isAuthenticated && user?.groups && (user.groups.includes('owner') || user.groups.includes('admin'));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleJsonFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingJson(true);
      setJsonError(null);
      setJsonSuccess(null);

      const content = await file.text();
      const jsonData = JSON.parse(content);

      await updateAnalysis(id!, {
        dataset: analysis!.dataset,
        data: jsonData
      });

      setJsonSuccess('JSON data uploaded successfully!');
      queryClient.invalidateQueries({ queryKey: ['analysis', id] });
      event.target.value = '';
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Failed to upload JSON data');
    } finally {
      setUploadingJson(false);
    }
  };

  const handleImageClick = (image: DatasetImage) => {
    setSelectedImage(image);
    setImageModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      setDeleting(true);
      await deleteAnalysis(id);
      navigate('/datasets');
    } catch (err) {
      console.error('Failed to delete analysis:', err);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      setDeletingImageId(imageId);
      await deleteDatasetImage(imageId);
      queryClient.invalidateQueries({ queryKey: ['datasetImages', id] });
    } catch (err) {
      console.error('Failed to delete image:', err);
    } finally {
      setDeletingImageId(null);
    }
  };

  const showCategoryAlert = (type: 'success' | 'error', message: string) => {
    setCategoryAlert({ type, message });
    setTimeout(() => setCategoryAlert(null), 5000);
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
          datasetId: id!,
          color: categoryForm.color
        });
        showCategoryAlert('success', 'Category created successfully');
      }
      setCategoryModalOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', color: '#1976d2' });
      queryClient.invalidateQueries({ queryKey: ['datasetCategories', id] });
    } catch (error) {
      showCategoryAlert('error', `Failed to ${editingCategory ? 'update' : 'create'} category`);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteImageCategory(categoryId);
      showCategoryAlert('success', 'Category deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['datasetCategories', id] });
    } catch (error) {
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

  const handleEditImageCategory = (image: DatasetImage) => {
    setEditingImage(image);
    setSelectedCategoryForEdit(image.categoryId || '');
    setSelectedTagsForEdit(image.tags.join(', '));
    setSelectedWeatherForEdit(image.weatherCondition || '');
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
        weatherCondition: selectedWeatherForEdit || undefined
      });
      showCategoryAlert('success', 'Image updated successfully');
      setEditImageModalOpen(false);
      setEditingImage(null);
      queryClient.invalidateQueries({ queryKey: ['datasetImages', id] });
    } catch (error) {
      showCategoryAlert('error', 'Failed to update image');
    }
  };

  const handleExportImages = async (filter: 'good' | 'bad' | 'all') => {
    if (!id) return;
    try {
      setExporting(filter);
      const config = getGlobalConfig();
      const apiUrl = config.VISION_API_URL || 'http://localhost:4010';
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('tag', filter);

      const response = await fetch(`${apiUrl}/api/dataset-images/export-names/${id}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error('Failed to export images');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `images_${filter}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      showCategoryAlert('error', 'Failed to export images');
    } finally {
      setExporting(null);
    }
  };

  const handleUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['datasetImages', id] });
  };

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading dataset analysis...</Typography>
      </Container>
    );
  }

  if (error || !analysis) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Alert severity="error">
          Failed to load dataset analysis: {error instanceof Error ? error.message : 'Analysis not found'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/datasets')}>Back to Datasets</Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Datasets', href: '/datasets' },
          { label: analysis.dataset, current: true }
        ]}
      />

      <DatasetHeader
        analysis={analysis}
        imagesCount={imagesData?.data?.pagination?.total || 0}
        isLoading={isLoading}
        onRefresh={() => refetch()}
        onDelete={() => setDeleteDialogOpen(true)}
        canDelete={!!canDeleteDatasets()}
      />

      <Paper sx={{ mb: 4, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider', 
            '& .MuiTab-root': { 
              fontWeight: 500,
              minHeight: 48,
              px: { xs: 2, sm: 3 },
              minWidth: { xs: 'auto', sm: 90 },
              flexShrink: 0
            },
            '& .MuiTabs-scrollButtons': {
              display: { xs: 'flex', sm: 'auto' }
            },
            '& .MuiTabs-scroller': {
              overflow: 'auto !important',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }
          }}
        >
          <Tab label="Description" />
          <Tab label="Categories" />
          <Tab label="Images" />
          <Tab label="Export" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {activeTab === 0 && (
            <DatasetInfoTab
              analysis={analysis}
              canDelete={!!canDeleteDatasets()}
              onUploadJson={handleJsonFileChange}
              uploadingJson={uploadingJson}
              jsonError={jsonError}
              jsonSuccess={jsonSuccess}
            />
          )}

          {activeTab === 1 && (
            <DatasetCategoriesTab
              categories={datasetCategories}
              isLoading={categoriesQueryLoading}
              error={categoriesError}
              canDelete={!!canDeleteDatasets()}
              onEditCategory={openEditCategoryModal}
              onDeleteCategory={handleDeleteCategory}
              categoryAlert={categoryAlert}
            />
          )}

          {activeTab === 2 && (
            <DatasetImagesTab
              images={images}
              pagination={pagination}
              isLoading={imagesLoading}
              error={imagesError}
              filters={filters}
              updateFilter={updateFilter}
              categories={datasetCategories}
              availableTags={availableTags}
              onImageClick={handleImageClick}
              onEditImage={handleEditImageCategory}
              onDeleteImage={handleDeleteImage}
              deletingImageId={deletingImageId}
              canDelete={!!canDeleteDatasets()}
              page={currentPage}
              setPage={setCurrentPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
              onUploadClick={() => setUploadDialogOpen(true)}
            />
          )}

          {activeTab === 3 && (
            <DatasetExportTab
              onExport={handleExportImages}
              exporting={exporting}
            />
          )}
        </Box>
      </Paper>

      <Dialog open={imageModalOpen} onClose={() => setImageModalOpen(false)} maxWidth="lg" fullWidth>
        <DialogContent sx={{ p: 0, position: 'relative', height: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconButton
            onClick={() => setImageModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8, bgcolor: 'rgba(0, 0, 0, 0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.7)' }, zIndex: 1 }}
          >
            <CloseIcon />
          </IconButton>
          {selectedImage && (
            <Box
              component="img"
              src={selectedImage.signedUrl}
              alt={selectedImage.title || selectedImage.originalName}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Dataset Analysis</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the dataset analysis "{analysis?.dataset}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <CategoryModal
        open={categoryModalOpen}
        onClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(null);
          setCategoryForm({ name: '', description: '', color: '#1976d2' });
        }}
        onSave={handleSaveCategory}
        isEditing={!!editingCategory}
        form={categoryForm}
        setForm={setCategoryForm}
      />

      <FileUpload
        datasetId={id!}
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      <EditImageModal
        open={editImageModalOpen}
        onClose={() => {
          setEditImageModalOpen(false);
          setEditingImage(null);
        }}
        onSave={handleSaveImageCategory}
        categories={datasetCategories}
        selectedCategory={selectedCategoryForEdit}
        setSelectedCategory={setSelectedCategoryForEdit}
        selectedWeather={selectedWeatherForEdit}
        setSelectedWeather={setSelectedWeatherForEdit}
        selectedTags={selectedTagsForEdit}
        setSelectedTags={setSelectedTagsForEdit}
      />
    </Container>
  );
};

export default DatasetDetailPage;