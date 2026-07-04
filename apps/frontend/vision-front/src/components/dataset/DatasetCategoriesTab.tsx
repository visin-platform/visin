import React from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Chip,
  IconButton,
  Alert
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { ImageCategory } from '../../services/imageCategoryService';

interface DatasetCategoriesTabProps {
  categories: ImageCategory[];
  isLoading: boolean;
  error: any;
  canDelete: boolean;
  onEditCategory: (category: ImageCategory) => void;
  onDeleteCategory: (id: string) => void;
  categoryAlert: { type: 'success' | 'error'; message: string } | null;
}

const DatasetCategoriesTab: React.FC<DatasetCategoriesTabProps> = ({
  categories,
  isLoading,
  error,
  canDelete,
  onEditCategory,
  onDeleteCategory,
  categoryAlert
}) => {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6">
            Categories ({categories.length})
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 0.5
            }}>
            Manage image categories for this dataset.
          </Typography>
        </Box>
      </Box>
      {categoryAlert && (
        <Alert severity={categoryAlert.type} sx={{ mb: 2 }}>
          {categoryAlert.message}
        </Alert>
      )}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" sx={{
            color: "text.secondary"
          }}>
            Categories not available
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1
            }}>
            This analysis dataset doesn't have associated categories in the image management system.
          </Typography>
        </Box>
      ) : categories.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" sx={{
            color: "text.secondary"
          }}>
            No categories found
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1
            }}>
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
              {categories.map((category) => (
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
                      <Typography variant="body1" sx={{
                        fontWeight: "medium"
                      }}>
                        {category.name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
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
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      {new Date(category.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {canDelete && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => onEditCategory(category)}
                          color="primary"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => onDeleteCategory(category._id)}
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
  );
};

export default DatasetCategoriesTab;
