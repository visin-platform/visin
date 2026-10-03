import { trainingStatusLabel } from '../../utils/trainingStatus';
import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { ResponsiveActions } from '@visin/frontend-core';
import { Refresh as RefreshIcon, Edit as EditIcon, Delete as DeleteIcon, Code as CodeIcon } from '@mui/icons-material';
import { Training } from '../../types';

interface TrainingDetailHeaderProps {
  training: Training;
  isAuthenticated: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  /** open the snippets that read this run in a script or notebook */
  onUse?: () => void;
  onEdit: () => void;
  onDeleteClick: () => void;
}

const TrainingDetailHeader: React.FC<TrainingDetailHeaderProps> = ({
  training,
  isAuthenticated,
  isLoading,
  onRefresh,
  onUse,
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

        {training.status === 'stalled' && <Typography color="warning.main" sx={{ mb: 1 }}>{trainingStatusLabel(training)}</Typography>}
        {training.tags && training.tags.length > 0 && (
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            {training.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Stack>
        )}
      </Box>

      <Box data-guide="training-actions" sx={{ flexShrink: 0 }}>
        <ResponsiveActions
          menuLabel={`More actions for ${training.name}`}
        actions={[
          { label: 'Refresh', icon: <RefreshIcon />, onClick: onRefresh, disabled: isLoading },
          ...(onUse ? [{ label: 'Use this', icon: <CodeIcon />, onClick: onUse }] : []),
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
  </Box>
);

export default TrainingDetailHeader;
