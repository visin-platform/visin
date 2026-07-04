import React from 'react';
import {
  Box,
  Typography,
  Button,
  Stack
} from '@mui/material';
import {
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
}

const DatasetHeader: React.FC<DatasetHeaderProps> = ({
  analysis,
  imagesCount,
  isLoading,
  onRefresh,
  onDelete,
  canDelete
}) => {
  return (
    <Box sx={{
      mb: 4
    }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: "space-between",
          alignItems: { xs: 'flex-start', md: 'flex-start' },
          gap: 3
        }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{
            fontWeight: "bold"
          }}>
            {analysis.dataset}
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              maxWidth: 800,
              mb: 2
            }}>
            Dataset analysis with {imagesCount} images
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
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
