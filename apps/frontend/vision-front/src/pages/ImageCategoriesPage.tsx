import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
  CircularProgress,
  MenuItem,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import {
  ImageCategory,
  getAllCategories,
  createImageCategory,
  updateImageCategory,
  deleteImageCategory
} from '../services/datasetImageService';
import { datasetService, Dataset } from '../services/datasetService';

const ImageCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<ImageCategory[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ImageCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    datasetId: '',
    color: '#1976d2'
  });
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load categories and datasets on component mount
  useEffect(() => {
    loadCategories();
    loadDatasets();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const cats = await getAllCategories();
      setCategories(cats);
    } catch (error) {
      showAlert('error', 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const loadDatasets = async () => {
    setDatasetsLoading(true);
    try {
      const response = await datasetService.getDatasets({ limit: 1000 }); // Get all datasets
      setDatasets(response.data.datasets);
    } catch (error) {
      showAlert('error', 'Failed to load datasets');
    } finally {
      setDatasetsLoading(false);
    }
  };

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name.trim() || !categoryForm.datasetId.trim()) {
      showAlert('error', 'Category name and dataset ID are required');
      return;
    }

    try {
      await createImageCategory({
        ...categoryForm,
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        datasetId: categoryForm.datasetId
      });
      showAlert('success', 'Category created successfully');
      setCreateModalOpen(false);
      setCategoryForm({ name: '', description: '', datasetId: '', color: '#1976d2' });
      loadCategories();
    } catch (error) {
      showAlert('error', 'Failed to create category');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !categoryForm.name.trim()) {
      showAlert('error', 'Category name is required');
      return;
    }

    try {
      await updateImageCategory(editingCategory._id, {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        color: categoryForm.color
      });
      showAlert('success', 'Category updated successfully');
      setCreateModalOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', datasetId: '', color: '#1976d2' });
      loadCategories();
    } catch (error) {
      showAlert('error', 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await deleteImageCategory(categoryId);
      showAlert('success', 'Category deleted successfully');
      loadCategories();
    } catch (error) {
      showAlert('error', 'Failed to delete category');
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', datasetId: '', color: '#1976d2' });
    setCreateModalOpen(true);
  };

  const openEditModal = (category: ImageCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      datasetId: category.datasetId,
      color: category.color || '#1976d2'
    });
    setCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setCreateModalOpen(false);
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', datasetId: '', color: '#1976d2' });
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Image Categories
        </Typography>

        {alert && (
          <Alert severity={alert.type} sx={{ mb: 2 }}>
            {alert.message}
          </Alert>
        )}

        {/* Header with Add Button */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            All Image Categories
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateModal}
          >
            Add Category
          </Button>
        </Box>

            {/* Categories Table */}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Dataset</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Color</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {categories.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">
                            No categories found. Create your first category to get started.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      categories.map((category) => (
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
                            <Chip
                              label={datasets.find(d => d._id === category.datasetId)?.name || category.datasetId}
                              size="small"
                              variant="outlined"
                            />
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
                            <IconButton
                              size="small"
                              onClick={() => openEditModal(category)}
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
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>

      {/* Create/Edit Category Modal */}
      <Dialog open={createModalOpen} onClose={handleCloseModal} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCategory ? 'Edit Category' : 'Create New Category'}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Dataset</InputLabel>
            <Select
              value={categoryForm.datasetId}
              onChange={(e) => setCategoryForm({ ...categoryForm, datasetId: e.target.value })}
              label="Dataset"
              required
              disabled={!!editingCategory || datasetsLoading}
            >
              {datasets.map((dataset) => (
                <MenuItem key={dataset._id} value={dataset._id}>
                  {dataset.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          <Button onClick={handleCloseModal}>Cancel</Button>
          <Button
            onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
            variant="contained"
            disabled={!categoryForm.name.trim() || (!editingCategory && !categoryForm.datasetId.trim())}
          >
            {editingCategory ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ImageCategoriesPage;