import React, { useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { Folder as FolderIcon, Public as PublicIcon } from '@mui/icons-material';
import { livePalette, RowIcon } from '@visin/frontend-core';
import type { Project } from '../../types/Project';

/**
 * What starts a project's row: its picture where it has one, else the tile that says whether it is public.
 * A picture that fails to load (a file that is gone, a service that is down) gives way to the tile rather than a broken-image
 * icon. Decorative: the name beside it is the label.
 */
const ProjectThumb: React.FC<{ project: Pick<Project, 'visibility' | 'coverUrl'> }> = ({ project }) => {
  const theme = useTheme();
  const [failed, setFailed] = useState<string>();
  if (project.coverUrl && project.coverUrl !== failed) {
    return (
      <Box
        component="img"
        src={project.coverUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(project.coverUrl)}
        sx={{ width: 40, height: 40, borderRadius: '12px', objectFit: 'cover', flexShrink: 0, bgcolor: 'action.hover' }}
      />
    );
  }
  const isPublic = project.visibility === 'public';
  return (
    <RowIcon color={isPublic ? livePalette(theme).success.main : livePalette(theme).primary.main}>
      {isPublic ? <PublicIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
    </RowIcon>
  );
};

export default ProjectThumb;
