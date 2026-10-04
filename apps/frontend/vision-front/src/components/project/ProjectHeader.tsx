import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

import type { Project } from '../../types/Project';
import { visionApiOrigin } from '../../config/visionApi';
import { OwnerChip, ShareButton } from '@visin/frontend-core';
import { useAuth } from '../../contexts/AuthContext';

interface ProjectHeaderProps {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({ project, onEdit, onDelete }) => {
  const { user } = useAuth();
  return (
    <Box sx={{ mb: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{
              fontWeight: 'bold',
              fontSize: { xs: '1.5rem', sm: '2rem' },
              mb: { xs: 0, sm: 0.35 }
            }}
          >
            {project.name}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              maxWidth: 600,
              mb: 1.5,
              display: { xs: 'none', sm: 'block' }
            }}
          >
            {project.description || 'No description provided.'}
          </Typography>
          <OwnerChip owner={project.owner} userId={user?.id} groups={[]} ownerName={project.owner.name} />
        </Box>

        {project.visibility === 'public' && (
          <ShareButton
            url={`${visionApiOrigin().replace(/\/$/, '')}/api/public/share/projects/${encodeURIComponent(project._id)}`}
          />
        )}
        {project.permissions.manage && (
          <Box sx={{ display: 'flex', gap: 0.5, ml: 2 }}>
            <IconButton aria-label="Edit project" color="primary" onClick={onEdit} size="small">
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton aria-label="Move project to trash" color="error" onClick={onDelete} size="small">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ProjectHeader;
