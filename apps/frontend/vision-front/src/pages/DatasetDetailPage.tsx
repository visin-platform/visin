import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Stack,
  useTheme
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Refresh as RefreshIcon
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

// Weather condition options
const WEATHER_CONDITIONS: { value: WeatherCondition; label: string }[] = [
  { value: 'day_fair', label: 'Day Fair' },
  { value: 'night_fair', label: 'Night Fair' },
  { value: 'day_rain', label: 'Day Rain' },
  { value: 'night_rain', label: 'Night Rain' },
  { value: 'snow', label: 'Snow' }
];

const DatasetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAuthenticated, user } = useAuth();

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [uploadingJson, setUploadingJson] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSuccess, setJsonSuccess] = useState<string | null>(null);
  const [jsonExpanded, setJsonExpanded] = useState(false);
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
  // Image filtering state
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([]);
  const [selectedWeatherFilter, setSelectedWeatherFilter] = useState<WeatherCondition | ''>('');
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  // Export state
  const [exporting, setExporting] = useState<'good' | 'bad' | 'all' | null>(null);

  const { data: analysis, isLoading, error, refetch } = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => getAnalysisById(id!),
    enabled: Boolean(id)
  });

  const { data: imagesData, isLoading: imagesLoading, error: imagesError } = useQuery({
    queryKey: ['datasetImages', id, selectedCategoryFilter, selectedTagFilter, selectedWeatherFilter, currentPage, pageSize],
    queryFn: async () => {
      // Use getImagesByDataset for efficient server-side filtering
      const response = await getImagesByDataset(
        id!,
        currentPage,
        pageSize,
        undefined, // search
        selectedCategoryFilter || undefined, // categoryId
        selectedTagFilter.length > 0 ? selectedTagFilter.join(' ') : undefined, // tags as space-separated string
        selectedWeatherFilter || undefined, // weatherCondition
        'updatedAt', // sortBy
        'desc' // sortOrder - most recently updated first
      );
      return response;
    },
    enabled: Boolean(id),
    retry: false, // Don't retry on error
  });

  const { data: categoriesData, isLoading: categoriesQueryLoading, error: categoriesError } = useQuery({
    queryKey: ['datasetCategories', id],
    queryFn: () => getCategoriesByDataset(id!),
    enabled: Boolean(id),
    retry: false, // Don't retry on error
  });

  // Get available tags for this dataset
  const { data: availableTagsData } = useQuery({
    queryKey: ['datasetTags', id],
    queryFn: async () => {
      // Get a sample of images to extract available tags
      const response = await getImagesByDataset(id!, 1, 1000, undefined, undefined, undefined, undefined, 'updatedAt', 'desc'); // Get up to 1000 images to sample tags, sorted by updatedAt
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

  // Set page title
  usePageTitle(analysis ? `Dataset: ${analysis.dataset} - Vision` : 'Dataset Details - Vision');

  // Debug logging
  React.useEffect(() => {
    console.log('Pagination data:', pagination);
    console.log('Images count:', images.length);
  }, [pagination, images.length]);

  // Permission check function
  const canDeleteDatasets = () => {
    return isAuthenticated && user?.groups && (user.groups.includes('owner') || user.groups.includes('admin'));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleJsonFileClick = () => {
    fileInputRef.current?.click();
  };

    const handleJsonFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingJson(true);
      setJsonError(null);
      setJsonSuccess(null);

      // Read file content
      const content = await file.text();
      const jsonData = JSON.parse(content);

      // Update the analysis with the JSON data
      await updateAnalysis(id!, {
        dataset: analysis!.dataset,
        data: jsonData
      });

      setJsonSuccess('JSON data uploaded successfully!');
      
      // Refresh the analysis data
      queryClient.invalidateQueries({ queryKey: ['analysis', id] });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const handleCloseImageModal = () => {
    setImageModalOpen(false);
    setSelectedImage(null);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;

    try {
      setDeleting(true);
      await deleteAnalysis(id);
      navigate('/datasets');
    } catch (err) {
      console.error('Failed to delete analysis:', err);
      // You might want to show an error message here
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      setDeletingImageId(imageId);
      await deleteDatasetImage(imageId);
      // Refresh the images list
      queryClient.invalidateQueries({ queryKey: ['datasetImages', id] });
    } catch (err) {
      console.error('Failed to delete image:', err);
      // You might want to show an error message here
    } finally {
      setDeletingImageId(null);
    }
  };

  // Category management functions
  const showCategoryAlert = (type: 'success' | 'error', message: string) => {
    setCategoryAlert({ type, message });
    setTimeout(() => setCategoryAlert(null), 5000);
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim()) {
      showCategoryAlert('error', 'Category name is required');
      return;
    }

    try {
      await createImageCategory({
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        datasetId: id!,
        color: categoryForm.color
      });
      showCategoryAlert('success', 'Category created successfully');
      setCategoryModalOpen(false);
      setCategoryForm({ name: '', description: '', color: '#1976d2' });
      // Refresh categories
      queryClient.invalidateQueries({ queryKey: ['datasetCategories', id] });
    } catch (error) {
      showCategoryAlert('error', 'Failed to create category');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !categoryForm.name.trim()) {
      showCategoryAlert('error', 'Category name is required');
      return;
    }

    try {
      await updateImageCategory(editingCategory._id, {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        color: categoryForm.color
      });
      showCategoryAlert('success', 'Category updated successfully');
      setCategoryModalOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', color: '#1976d2' });
      // Refresh categories
      queryClient.invalidateQueries({ queryKey: ['datasetCategories', id] });
    } catch (error) {
      showCategoryAlert('error', 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await deleteImageCategory(categoryId);
      showCategoryAlert('success', 'Category deleted successfully');
      // Refresh categories
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

  const handleCloseCategoryModal = () => {
    setCategoryModalOpen(false);
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', color: '#1976d2' });
  };

  // Image editing functions
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
      // Parse tags from comma-separated string
      const tags = selectedTagsForEdit
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      // Update the image with new category and tags
      await updateDatasetImage(editingImage._id, {
        categoryId: selectedCategoryForEdit || undefined,
        tags: tags,
        weatherCondition: selectedWeatherForEdit || undefined
      });
      showCategoryAlert('success', 'Image updated successfully');
      setEditImageModalOpen(false);
      setEditingImage(null);
      setSelectedCategoryForEdit('');
      setSelectedTagsForEdit('');
      setSelectedWeatherForEdit('');
      // Refresh images
      queryClient.invalidateQueries({ queryKey: ['datasetImages', id] });
    } catch (error) {
      showCategoryAlert('error', 'Failed to update image');
    }
  };

  const handleCloseEditImageModal = () => {
    setEditImageModalOpen(false);
    setEditingImage(null);
    setSelectedCategoryForEdit('');
    setSelectedTagsForEdit('');
    setSelectedWeatherForEdit('');
  };

  const handleUploadComplete = () => {
    // Refresh images after upload
    queryClient.invalidateQueries({ queryKey: ['datasetImages', id] });
  };

  // Pagination handlers
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < pagination.pages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when page size changes
  };

  // Reset to page 1 when category filter or tag filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategoryFilter, selectedTagFilter, selectedWeatherFilter]);

  // Export handler
  const handleExportImages = async (filter: 'good' | 'bad' | 'all') => {
    if (!id) return;

    try {
      setExporting(filter);

      const config = getGlobalConfig();
      const apiUrl = config.VISION_API_URL || 'http://localhost:4010';

      // Build query parameters
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('tag', filter);
      }

      const response = await fetch(`${apiUrl}/api/dataset-images/export-names/${id}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to export images');
      }

      // Create blob and download
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

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading dataset analysis...
        </Typography>
      </Container>
    );
  }

  if (error || !analysis) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">
          Failed to load dataset analysis: {error instanceof Error ? error.message : 'Analysis not found'}
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => navigate('/datasets')}>
            Back to Datasets
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/datasets')}
          sx={{ mb: 2, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'transparent' } }}
        >
          Back to Datasets
        </Button>

        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'flex-start' }} gap={3}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight="bold">
              {analysis.dataset}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800, mb: 2 }}>
              Dataset analysis with {imagesData?.data?.pagination?.total || 0} images
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Created: {new Date(analysis.createdAt).toLocaleString()} • 
              Updated: {new Date(analysis.updatedAt).toLocaleString()}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Button 
              startIcon={<RefreshIcon />} 
              onClick={() => refetch()} 
              variant="outlined" 
              color="inherit"
              disabled={isLoading}
            >
              Refresh
            </Button>
            {canDeleteDatasets() && (
              <Button 
                startIcon={<DeleteIcon />} 
                onClick={handleDeleteClick} 
                color="error" 
                variant="outlined"
                disabled={isLoading}
              >
                Delete
              </Button>
            )}
          </Stack>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 4, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .MuiTab-root': { fontWeight: 500 }
          }}
        >
          <Tab label="Description" />
          <Tab label="Categories" />
          <Tab label="Images" />
          <Tab label="Export" />
        </Tabs>

        {/* Tab Panels */}
        <Box sx={{ p: 3 }}>
          {activeTab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6">
                    Dataset Analysis Data
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Upload JSON analysis data for this dataset.
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={jsonExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setJsonExpanded(!jsonExpanded)}
                  >
                    {jsonExpanded ? 'Collapse' : 'Expand'}
                  </Button>
                  {canDeleteDatasets() && (
                    <Button
                      variant="contained"
                      startIcon={uploadingJson ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                      onClick={handleJsonFileClick}
                      disabled={uploadingJson}
                    >
                      {uploadingJson ? 'Uploading...' : 'Upload JSON'}
                    </Button>
                  )}
                </Box>
              </Box>

              {/* JSON File Input (hidden) */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleJsonFileChange}
                style={{ display: 'none' }}
              />

              {/* JSON Messages */}
              {jsonError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {jsonError}
                </Alert>
              )}

              {jsonSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {jsonSuccess}
                </Alert>
              )}

              <Paper sx={{ 
                p: 2, 
                backgroundColor: '#f5f5f5', 
                maxHeight: jsonExpanded ? 'none' : '70vh', 
                overflow: jsonExpanded ? 'visible' : 'auto',
                transition: 'max-height 0.3s ease-in-out'
              }}>
                <pre style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                  {JSON.stringify(analysis.data || (() => {
                    // Handle legacy data structure where JSON is at top level
                    const { _id, createdAt, updatedAt, ...jsonData } = analysis as any;
                    return jsonData;
                  })(), null, 2)}
                </pre>
              </Paper>
            </Box>
          )}

          {activeTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6">
                    Categories ({datasetCategories.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Manage image categories for this dataset.
                  </Typography>
                </Box>
              </Box>

              {categoryAlert && (
                <Alert severity={categoryAlert.type} sx={{ mb: 2 }}>
                  {categoryAlert.message}
                </Alert>
              )}

              {categoriesQueryLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : categoriesError ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="h6" color="text.secondary">
                    Categories not available
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    This analysis dataset doesn't have associated categories in the image management system.
                  </Typography>
                </Box>
              ) : datasetCategories.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="h6" color="text.secondary">
                    No categories found
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Create your first category to organize images for this dataset.
                  </Typography>
                </Box>
              ) : (
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Color</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {datasetCategories.map((category) => (
                        <TableRow key={category._id} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Box
                                sx={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  backgroundColor: category.color || '#1976d2',
                                  mr: 1
                                }}
                              />
                              <Typography variant="body1" fontWeight="medium">
                                {category.name}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {category.description || 'No description'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              sx={{
                                backgroundColor: category.color || '#1976d2',
                                color: 'white'
                              }}
                              label={category.color || '#1976d2'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {new Date(category.createdAt).toLocaleDateString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {canDeleteDatasets() && (
                              <>
                                <IconButton
                                  size="small"
                                  onClick={() => openEditCategoryModal(category)}
                                  color="primary"
                                >
                                  <EditIcon />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteCategory(category._id)}
                                  color="error"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {activeTab === 2 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6">
                    Images ({pagination.total.toLocaleString()})
                  </Typography>
                </Box>
                {canDeleteDatasets() && (
                  <Button
                    variant="contained"
                    startIcon={<CloudUploadIcon />}
                    onClick={() => setUploadDialogOpen(true)}
                  >
                    Upload Images
                  </Button>
                )}
              </Box>

              {/* Category Filter */}
              <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Filter by Category</InputLabel>
                  <Select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value as string)}
                    label="Filter by Category"
                  >
                    <MenuItem value="">
                      <em>All Categories</em>
                    </MenuItem>
                    {datasetCategories.map((category) => (
                      <MenuItem key={category._id} value={category._id}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              backgroundColor: category.color || '#1976d2',
                              mr: 1
                            }}
                          />
                          {category.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Filter by Weather</InputLabel>
                  <Select
                    value={selectedWeatherFilter}
                    onChange={(e) => setSelectedWeatherFilter(e.target.value as WeatherCondition | '')}
                    label="Filter by Weather"
                  >
                    <MenuItem value="">
                      <em>All Weather Conditions</em>
                    </MenuItem>
                    {WEATHER_CONDITIONS.map((condition) => (
                      <MenuItem key={condition.value} value={condition.value}>
                        {condition.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Autocomplete
                  multiple
                  size="small"
                  options={availableTags}
                  value={selectedTagFilter}
                  onChange={(_, newValue) => setSelectedTagFilter(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Filter by Tags"
                      placeholder="Select tags..."
                      sx={{ minWidth: 200 }}
                      helperText="Select one or more tags to filter images"
                    />
                  )}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        {...getTagProps({ index })}
                        key={option}
                        label={option}
                        size="small"
                      />
                    ))
                  }
                  sx={{ minWidth: 200 }}
                />
              </Box>

              {imagesLoading ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Loading images...
                  </Typography>
                </Box>
              ) : imagesError ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="h6" color="text.secondary">
                    Images not available
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    This analysis dataset doesn't have associated images in the image management system. 
                    Upload images separately to enable image labeling and categorization.
                  </Typography>
                </Box>
              ) : images.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="h6" color="text.secondary">
                    No images available
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Images will be displayed here once uploaded to the dataset.
                  </Typography>
                </Box>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'repeat(2, 1fr)',
                      md: 'repeat(3, 1fr)',
                      lg: 'repeat(4, 1fr)'
                    },
                    gap: 2
                  }}
                >
                  {images.map((image: DatasetImage) => {
                    const hasGoodLabel = image.tags.some(tag => 
                      tag.toLowerCase().includes('good') || tag === 'good_annotations'
                    );
                    const hasBadLabel = image.tags.some(tag => 
                      tag.toLowerCase().includes('bad') || tag === 'bad_annotations'
                    );
                    
                    let statusColor = 'warning.main'; // unlabeled
                    let statusText = 'Unlabeled';
                    
                    if (hasGoodLabel) {
                      statusColor = 'success.main';
                      statusText = 'Good';
                    } else if (hasBadLabel) {
                      statusColor = 'error.main';
                      statusText = 'Bad';
                    }
                    
                    return (
                      <Card key={image._id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ position: 'relative' }}>
                          <CardMedia
                            component="img"
                            height="200"
                            image={image.thumbnailSignedUrl || image.signedUrl}
                            alt={image.title || image.originalName}
                            sx={{ objectFit: 'cover', cursor: 'pointer' }}
                            onClick={() => handleImageClick(image)}
                          />
                          
                          {/* Status indicator */}
                          <Chip
                            label={statusText}
                            size="small"
                            sx={{
                              position: 'absolute',
                              top: 8,
                              right: 50, // Leave space for action buttons
                              backgroundColor: statusColor,
                              color: 'white',
                              fontSize: '0.7rem',
                              height: 20
                            }}
                          />
                          
                          {canDeleteDatasets() && (
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditImageCategory(image);
                              }}
                              sx={{
                                position: 'absolute',
                                top: 8,
                                left: 8,
                                bgcolor: 'rgba(25, 118, 210, 0.8)',
                                color: 'white',
                                '&:hover': {
                                  bgcolor: 'rgba(21, 101, 192, 0.9)',
                                },
                              }}
                              size="small"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}
                          {canDeleteDatasets() && (
                            <IconButton
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteImage(image._id);
                              }}
                              disabled={deletingImageId === image._id}
                              sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                bgcolor: 'rgba(244, 67, 54, 0.8)',
                                color: 'white',
                                '&:hover': {
                                  bgcolor: 'rgba(211, 47, 47, 0.9)',
                                },
                                '&:disabled': {
                                  bgcolor: 'rgba(244, 67, 54, 0.4)',
                                },
                              }}
                              size="small"
                            >
                              {deletingImageId === image._id ? (
                                <CircularProgress size={16} color="inherit" />
                              ) : (
                                <DeleteIcon fontSize="small" />
                              )}
                            </IconButton>
                          )}
                        </Box>
                        <CardContent sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle2" noWrap>
                            {image.title || image.originalName}
                          </Typography>
                          {image.description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {image.description}
                            </Typography>
                          )}
                          <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {image.tags.slice(0, 2).map((tag, index) => (
                              <Chip key={index} label={tag} size="small" variant="outlined" />
                            ))}
                            {image.tags.length > 2 && (
                              <Chip label={`+${image.tags.length - 2}`} size="small" variant="outlined" />
                            )}
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}

              {/* Pagination */}
              {images.length > 0 && !imagesError && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Show:
                    </Typography>
                    <Select
                      size="small"
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      sx={{ minWidth: 80 }}
                    >
                      <MenuItem value={10}>10</MenuItem>
                      <MenuItem value={25}>25</MenuItem>
                      <MenuItem value={50}>50</MenuItem>
                      <MenuItem value={100}>100</MenuItem>
                    </Select>
                  </Box>

                  <Button
                    variant="outlined"
                    onClick={handlePreviousPage}
                    disabled={currentPage <= 1}
                    startIcon={<ArrowBackIcon />}
                  >
                    Previous
                  </Button>

                  <Typography variant="body2" color="text.secondary">
                    Page {pagination.page} of {pagination.pages} (Total: {pagination.total.toLocaleString()} images)
                  </Typography>

                  <Button
                    variant="outlined"
                    onClick={handleNextPage}
                    disabled={currentPage >= pagination.pages}
                    endIcon={<ArrowForwardIcon />}
                  >
                    Next
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {activeTab === 3 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3 }}>
                Export Images
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Download a CSV file containing image names filtered by quality tags.
              </Typography>

              <Paper sx={{ p: 3, maxWidth: 500 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Filter Options
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => handleExportImages('good')}
                    disabled={exporting !== null}
                    startIcon={exporting === 'good' ? <CircularProgress size={20} color="inherit" /> : null}
                    sx={{ justifyContent: 'flex-start' }}
                  >
                    {exporting === 'good' ? 'Exporting Good Images...' : 'Export Good Images'}
                  </Button>

                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => handleExportImages('bad')}
                    disabled={exporting !== null}
                    startIcon={exporting === 'bad' ? <CircularProgress size={20} color="inherit" /> : null}
                    sx={{ justifyContent: 'flex-start' }}
                  >
                    {exporting === 'bad' ? 'Exporting Bad Images...' : 'Export Bad Images'}
                  </Button>

                  <Button
                    variant="outlined"
                    onClick={() => handleExportImages('all')}
                    disabled={exporting !== null}
                    startIcon={exporting === 'all' ? <CircularProgress size={20} color="inherit" /> : null}
                    sx={{ justifyContent: 'flex-start' }}
                  >
                    {exporting === 'all' ? 'Exporting All Images...' : 'Export All Images'}
                  </Button>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  CSV format: One image name per line, simple text format.
                </Typography>
              </Paper>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Image Modal */}
      <Dialog
        open={imageModalOpen}
        onClose={handleCloseImageModal}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent sx={{ p: 0, position: 'relative', height: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconButton
            onClick={handleCloseImageModal}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              bgcolor: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.7)',
              },
              zIndex: 1,
            }}
          >
            <CloseIcon />
          </IconButton>
          {selectedImage && (
            <Box
              component="img"
              src={selectedImage.signedUrl}
              alt={selectedImage.title || selectedImage.originalName}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Delete Dataset Analysis
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete the dataset analysis "{analysis?.dataset}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            Cancel
          </Button>
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

      {/* Category Modal */}
      <Dialog open={categoryModalOpen} onClose={handleCloseCategoryModal} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCategory ? 'Edit Category' : 'Create New Category'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Category Name"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            sx={{ mt: 2 }}
            required
            helperText="Enter a unique name for this category"
          />
          <TextField
            fullWidth
            label="Description"
            value={categoryForm.description}
            onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
            sx={{ mt: 2 }}
            multiline
            rows={3}
            helperText="Optional description for this category"
          />
          <TextField
            fullWidth
            label="Color"
            type="color"
            value={categoryForm.color}
            onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
            sx={{ mt: 2 }}
            helperText="Choose a color to visually identify this category"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCategoryModal}>Cancel</Button>
          <Button
            onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
            variant="contained"
            disabled={!categoryForm.name.trim()}
          >
            {editingCategory ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* File Upload Dialog */}
      <FileUpload
        datasetId={id!}
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploadComplete={handleUploadComplete}
      />

      {/* Edit Image Category Modal */}
      <Dialog open={editImageModalOpen} onClose={handleCloseEditImageModal} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit Image
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Update the category, weather condition, and tags for this image.
          </Typography>
          <TextField
            select
            fullWidth
            label="Category"
            value={selectedCategoryForEdit}
            onChange={(e) => setSelectedCategoryForEdit(e.target.value)}
            SelectProps={{
              native: true,
            }}
            sx={{ mb: 2 }}
          >
            <option value="">No Category</option>
            {datasetCategories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Weather Condition"
            value={selectedWeatherForEdit}
            onChange={(e) => setSelectedWeatherForEdit(e.target.value as WeatherCondition | '')}
            SelectProps={{
              native: true,
            }}
            sx={{ mb: 2 }}
          >
            <option value="">No Weather Condition</option>
            {WEATHER_CONDITIONS.map((condition) => (
              <option key={condition.value} value={condition.value}>
                {condition.label}
              </option>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="Tags"
            value={selectedTagsForEdit}
            onChange={(e) => setSelectedTagsForEdit(e.target.value)}
            helperText="Enter tags separated by commas (e.g., cat, animal, pet)"
            placeholder="tag1, tag2, tag3"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditImageModal}>Cancel</Button>
          <Button
            onClick={handleSaveImageCategory}
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DatasetDetailPage;