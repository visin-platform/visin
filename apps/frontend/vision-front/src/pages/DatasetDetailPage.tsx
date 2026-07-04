import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Container,
  Box,
  Paper,
  Alert,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogContentText,
  DialogActions,
  Button,
  useTheme,
  Typography
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { getAnalysisById, updateAnalysis, deleteAnalysis } from '../services/analysisService';
import {
  DatasetImage,
  deleteDatasetImage,
  getCategoriesByDataset,
  getImagesByDataset
} from '../services/datasetImageService';
import FileUpload from '../components/FileUpload';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { useDatasetImages } from '../hooks/useDatasetImages';
import { useDatasetCategoryManager } from '../hooks/useDatasetCategoryManager';
import { useDatasetImageEditor } from '../hooks/useDatasetImageEditor';
import { useDatasetImageExport } from '../hooks/useDatasetImageExport';

// Components
import DatasetHeader from '../components/dataset/DatasetHeader';
import DatasetInfoTab from '../components/dataset/DatasetInfoTab';
import DatasetCategoriesTab from '../components/dataset/DatasetCategoriesTab';
import DatasetImagesTab from '../components/dataset/DatasetImagesTab';
import DatasetExportTab from '../components/dataset/DatasetExportTab';
import DatasetDetailTabs from '../components/dataset/DatasetDetailTabs';
import ImageLightboxDialog from '../components/dataset/ImageLightboxDialog';
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

  // File upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

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

  const {
    categoryModalOpen,
    editingCategory,
    categoryForm,
    setCategoryForm,
    categoryAlert,
    showCategoryAlert,
    closeCategoryModal,
    handleSaveCategory,
    handleDeleteCategory,
    openEditCategoryModal
  } = useDatasetCategoryManager(id);

  const {
    editImageModalOpen,
    selectedCategoryForEdit,
    setSelectedCategoryForEdit,
    selectedTagsForEdit,
    setSelectedTagsForEdit,
    selectedWeatherForEdit,
    setSelectedWeatherForEdit,
    closeEditImageModal,
    handleEditImageCategory,
    handleSaveImageCategory
  } = useDatasetImageEditor(
    id,
    (message) => showCategoryAlert('success', message),
    (message) => showCategoryAlert('error', message)
  );

  const { exporting, handleExportImages } = useDatasetImageExport(id, (message) => showCategoryAlert('error', message));

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
        <DatasetDetailTabs value={activeTab} onChange={handleTabChange} />

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

      <ImageLightboxDialog
        open={imageModalOpen}
        image={selectedImage}
        onClose={() => setImageModalOpen(false)}
      />

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
        onClose={closeCategoryModal}
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
        onClose={closeEditImageModal}
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
