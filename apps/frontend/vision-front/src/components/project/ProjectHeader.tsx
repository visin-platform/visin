import React from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Chip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../utils';

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
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  isOwner,
  onBack,
  onEdit,
  onDelete
}) => {
  return (
    <Box sx={{ mb: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={onBack}
        sx={{ mb: 2, color: 'text.secondary' }}
      >
        Back to Projects
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
            {project.name}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800, mb: 2 }}>
            {project.description || 'No description provided.'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={project.isPublic ? 'Public' : 'Private'}
              color={project.isPublic ? 'success' : 'default'}
              variant="outlined"
              size="small"
            />
            <Chip
              label={`Created ${formatDateTime(project.createdAt)}`}
              variant="outlined"
              size="small"
            />
          </Box>
        </Box>

        {isOwner && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              color="primary"
              onClick={onEdit}
              size="small"
            >
              <EditIcon />
            </IconButton>
            <IconButton
              color="error"
              onClick={onDelete}
              size="small"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ProjectHeader;