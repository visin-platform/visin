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
import { DatasetAnalysis } from '../../services/analysisService';
import { formatDateTime } from '../../utils';

// Icon-only below `sm`; the labels are carried by aria-label there.
const compactButtonSx = {
  minWidth: { xs: 0, sm: 64 },
  px: { xs: 1, sm: 2 },
  '& .MuiButton-startIcon': {
    mr: { xs: 0, sm: 1 },
    ml: { xs: 0, sm: -0.5 }
  }
} as const;

const labelSx = { display: { xs: 'none', sm: 'inline' } } as const;

interface DatasetHeaderProps {
  analysis: DatasetAnalysis;
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
      mb: { xs: 2, sm: 4 }
    }}>
      <Box
        sx={{
          display: "flex",
          // The buttons stay beside the title on a phone once they are icons;
          // stacking them was what made this header tall.
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: { xs: 1, md: 3 }
        }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{
            fontWeight: "bold",
            fontSize: { xs: '1.5rem', sm: '2.125rem' }
          }}>
            {analysis.dataset}
          </Typography>
          <Typography
            sx={{
              color: "text.secondary",
              maxWidth: 800,
              mb: { xs: 0.25, sm: 1.5 },
              fontSize: { xs: '0.8125rem', sm: '1rem' }
            }}>
            Dataset analysis with {imagesCount} images
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary",
            fontSize: { xs: '0.75rem', sm: '0.875rem' }
          }}>
            Created: {formatDateTime(analysis.createdAt)} •{' '}
            Updated: {formatDateTime(analysis.updatedAt)}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            variant="outlined"
            color="inherit"
            disabled={isLoading}
            aria-label="Refresh"
            sx={compactButtonSx}
          >
            <Box component="span" sx={labelSx}>Refresh</Box>
          </Button>
          {canDelete && (
            <Button
              startIcon={<DeleteIcon />}
              onClick={onDelete}
              color="error"
              variant="outlined"
              disabled={isLoading}
              aria-label="Delete"
              sx={compactButtonSx}
            >
              <Box component="span" sx={labelSx}>Delete</Box>
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export default DatasetHeader;
