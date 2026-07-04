import React from 'react';
import {
  Box,
  Typography,
  IconButton
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

interface Project {
  _id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  ownerId: string;
}

interface ProjectHeaderProps {
  project: Project;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  isOwner,
  onEdit,
  onDelete
}) => {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{
              fontWeight: "bold",
              fontSize: { xs: '1.5rem', sm: '2rem' }
            }}>
            {project.name}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              maxWidth: 600,
              mb: 1.5,
              display: { xs: 'none', sm: 'block' }
            }}>
            {project.description || 'No description provided.'}
          </Typography>
        </Box>

        {isOwner && (
          <Box sx={{ display: 'flex', gap: 0.5, ml: 2 }}>
            <IconButton
              color="primary"
              onClick={onEdit}
              size="small"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              color="error"
              onClick={onDelete}
              size="small"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ProjectHeader;