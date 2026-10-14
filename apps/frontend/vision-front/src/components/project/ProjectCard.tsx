import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardActionArea, Chip, Typography } from '@mui/material';
import { Lock as LockIcon, Public as PublicIcon } from '@mui/icons-material';
import { OwnerChip, type OwnerGroup } from '@visin/frontend-core';
import type { Project } from '../../types/Project';
import { formatRelativeTime, runsLabel } from '../../utils';
import ProjectThumb from './ProjectThumb';

interface ProjectCardProps {
  project: Project;
  userId?: string;
  groups: OwnerGroup[];
}

/**
 * One project in the list, the whole card a link: its picture, name and owner, what it is for, then at a glance
 * whether it is public, how many runs it holds, whether any is running, and when it last moved.
 */
const ProjectCard: React.FC<ProjectCardProps> = ({ project, userId, groups }) => {
  const isPublic = project.visibility === 'public';
  const runs = runsLabel(project.runs);
  const active = project.lastActivityAt ?? project.updatedAt;

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea
        component={RouterLink}
        to={`/projects/${project._id}`}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', p: 2 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <ProjectThumb project={project} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap title={project.name}>
              {project.name}
            </Typography>
            <OwnerChip owner={project.owner} userId={userId} groups={groups} ownerName={project.owner.name} />
          </Box>
        </Box>

        <Typography
          variant="body2"
          sx={{
            color: project.description ? 'text.secondary' : 'text.disabled',
            mb: 1.5,
            flexGrow: 1,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {project.description || 'No description'}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
          <Chip
            size="small"
            variant="outlined"
            color={isPublic ? 'success' : 'default'}
            icon={isPublic ? <PublicIcon fontSize="small" /> : <LockIcon fontSize="small" />}
            label={isPublic ? 'Public' : 'Private'}
          />
          {runs && <Chip size="small" variant="outlined" label={runs} />}
          {!!project.runningRuns && (
            <Chip size="small" color="info" label={`${project.runningRuns} running`} />
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
            Active {formatRelativeTime(active)}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
};

export default ProjectCard;
