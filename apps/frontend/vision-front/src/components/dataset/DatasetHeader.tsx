import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

interface DatasetHeaderProps {
  analysis: any;
  imagesCount: number;
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onBack: () => void;
}

const DatasetHeader: React.FC<DatasetHeaderProps> = ({
  analysis,
  imagesCount,
  isLoading,
  onRefresh,
  onDelete,
  canDelete,
  onBack
}) => {
  return (
    <Box mb={4}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={onBack}
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
            Dataset analysis with {imagesCount} images
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Created: {new Date(analysis.createdAt).toLocaleString()} • 
            Updated: {new Date(analysis.updatedAt).toLocaleString()}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button 
            startIcon={<RefreshIcon />} 
            onClick={onRefresh} 
            variant="outlined" 
            color="inherit"
            disabled={isLoading}
          >
            Refresh
          </Button>
          {canDelete && (
            <Button 
              startIcon={<DeleteIcon />} 
              onClick={onDelete} 
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
  );
};

export default DatasetHeader;
