import React from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { Refresh as RefreshIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { Training } from '../../types';

interface TrainingDetailHeaderProps {
  training: Training;
  isAuthenticated: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDeleteClick: () => void;
}

const TrainingDetailHeader: React.FC<TrainingDetailHeaderProps> = ({
  training,
  isAuthenticated,
  isLoading,
  onRefresh,
  onEdit,
  onDeleteClick
}) => (
  <Box sx={{ mb: 3 }}>
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: "space-between",
        alignItems: { xs: 'flex-start', md: 'flex-start' },
        gap: 2
      }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mb: 1,
            flexWrap: "wrap"
          }}>
          <Typography
            variant="h5"
            component="h1"
            sx={{
              fontWeight: "bold",
              fontSize: { xs: '1.25rem', sm: '1.5rem' }
            }}>
            {training.name}
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            maxWidth: 600,
            mb: 1.5,
            display: { xs: 'none', sm: 'block' }
          }}>
          {training.description || 'No description provided'}
        </Typography>

        {training.tags && training.tags.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {training.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ borderRadius: 1 }} />
            ))}
          </Stack>
        )}
      </Box>

      <Stack direction="row" spacing={0.5}>
        <Button
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          variant="outlined"
          color="inherit"
          disabled={isLoading}
          size="small"
        >
          Refresh
        </Button>
        {isAuthenticated && (
          <>
            <Button startIcon={<EditIcon />} onClick={onEdit} variant="outlined" disabled={isLoading} size="small">
              Edit
            </Button>
            <Button
              startIcon={<DeleteIcon />}
              onClick={onDeleteClick}
              color="error"
              variant="outlined"
              disabled={isLoading}
              size="small"
            >
              Delete
            </Button>
          </>
        )}
      </Stack>
    </Box>
  </Box>
);

export default TrainingDetailHeader;
