import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { Lock as LockIcon, Public as PublicIcon } from '@mui/icons-material';

import type { Project } from '../../types/Project';
import { visionApiOrigin } from '../../config/visionApi';
import { OwnerChip, ShareButton } from '@visin/frontend-core';
import { useAuth } from '../../contexts/AuthContext';
import { formatRelativeTime } from '../../utils';

interface ProjectHeaderProps {
  project: Project;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({ project }) => {
  const { user } = useAuth();
  const isPublic = project.visibility === 'public';
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
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            <OwnerChip owner={project.owner} userId={user?.id} groups={[]} ownerName={project.owner.name} />
            <Chip
              size="small"
              variant="outlined"
              color={isPublic ? 'success' : 'default'}
              icon={isPublic ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
              label={isPublic ? 'Public' : 'Private'}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Active {formatRelativeTime(project.lastActivityAt ?? project.updatedAt)}
            </Typography>
          </Box>
        </Box>

        {project.visibility === 'public' && (
          <ShareButton
            url={`${visionApiOrigin().replace(/\/$/, '')}/api/public/share/projects/${encodeURIComponent(project._id)}`}
          />
        )}
      </Box>
    </Box>
  );
};

export default ProjectHeader;
