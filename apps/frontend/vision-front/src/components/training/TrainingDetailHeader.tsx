import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { ResponsiveActions } from '@visin/frontend-core';
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
        flexDirection: 'row',
        justifyContent: "space-between",
        alignItems: 'flex-start',
        gap: { xs: 1, md: 2 }
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
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            {training.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Stack>
        )}
      </Box>

      <ResponsiveActions
        menuLabel={`More actions for ${training.name}`}
        actions={[
          { label: 'Refresh', icon: <RefreshIcon />, onClick: onRefresh, disabled: isLoading },
          ...(isAuthenticated
            ? [
                { label: 'Edit', icon: <EditIcon />, onClick: onEdit, disabled: isLoading },
                { label: 'Delete', icon: <DeleteIcon />, onClick: onDeleteClick, disabled: isLoading, danger: true }
              ]
            : [])
        ]}
      />
    </Box>
  </Box>
);

export default TrainingDetailHeader;
