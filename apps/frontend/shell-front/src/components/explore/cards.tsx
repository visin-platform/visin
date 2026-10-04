import { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Link, Skeleton, Typography, useTheme } from '@mui/material';
import { Folder, PhotoLibrary } from '@mui/icons-material';
import { livePalette, tint } from '@visin/frontend-core';
import type { ExploreDataset, ExploreOwner, ExploreProject } from '../../services/exploreApi';
import { formatCount, formatRelative } from '../home/formatting';
import { panelSx } from '../home/panel';
import { cardGridSx } from './cardGrid';
import { OwnerLine } from './OwnerLine';

const clamp = (lines: number) =>
  ({
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
    overflowWrap: 'anywhere'
  }) as const;

interface CardProps {
  to: string;
  /** The picture or icon tile above the title. */
  media: ReactNode;
  title: string;
  description?: string;
  /** Who it belongs to, as far as they agreed to be shown. */
  owner: ExploreOwner;
  footer: string;
}

/**
 * A card is one target, but not one link: the title's link is stretched over the whole card
 * (`::after`), and the owner's name, being a link of its own, sits above it. A link inside a
 * link would be invalid and unreachable by keyboard.
 */
function Card({ to, media, title, description, owner, footer }: CardProps) {
  return (
    <Box
      component="article"
      sx={{
        ...panelSx,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color .15s ease',
        '&:hover, &:focus-within': { borderColor: 'primary.main' },
        '&:has(.card-link:focus-visible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 }
      }}
    >
      {media}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 2, flex: 1, minWidth: 0 }}>
        <OwnerLine owner={owner} />
        <Typography component="h3" sx={{ ...clamp(2), fontSize: '1rem', fontWeight: 700, lineHeight: 1.35 }}>
          <Link
            component={RouterLink}
            to={to}
            className="card-link"
            underline="none"
            sx={{
              color: 'text.primary',
              '&:focus-visible': { outline: 'none' },
              '&::after': { content: '""', position: 'absolute', inset: 0 }
            }}
          >
            {title}
          </Link>
        </Typography>
        {description && (
          <Typography variant="body2" sx={{ ...clamp(2), color: 'text.secondary' }}>
            {description}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 'auto', pt: 1 }}>
          {footer}
        </Typography>
      </Box>
    </Box>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const color = livePalette(theme).primary.main;
  return (
    <Box
      aria-hidden
      sx={{ aspectRatio: '16 / 7', display: 'grid', placeItems: 'center', color, bgcolor: tint(color, 0.1) }}
    >
      {children}
    </Box>
  );
}

export function ProjectCard({ project, now }: { project: ExploreProject; now: Date }) {
  return (
    <Card
      to={`/projects/${project.slug || project._id}`}
      media={
        <IconTile>
          <Folder fontSize="large" />
        </IconTile>
      }
      title={project.name}
      description={project.description}
      owner={project.owner}
      footer={`Updated ${formatRelative(project.updatedAt, now)}`}
    />
  );
}

export function DatasetCard({ dataset, now }: { dataset: ExploreDataset; now: Date }) {
  const groups = dataset.groups.length;
  return (
    <Card
      to={`/datasets/${dataset._id}`}
      media={
        dataset.coverUrl ? (
          <Box
            component="img"
            src={dataset.coverUrl}
            alt=""
            loading="lazy"
            sx={{ display: 'block', width: '100%', aspectRatio: '16 / 7', objectFit: 'cover' }}
          />
        ) : (
          <IconTile>
            <PhotoLibrary fontSize="large" />
          </IconTile>
        )
      }
      title={dataset.name}
      description={dataset.description}
      owner={dataset.owner}
      footer={[
        `${formatCount(dataset.imageCount)} ${dataset.imageCount === 1 ? 'image' : 'images'}`,
        groups > 0 ? `${groups} ${groups === 1 ? 'group' : 'groups'}` : null,
        formatRelative(dataset.updatedAt, now)
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  );
}

export function CardSkeletons({ count }: { count: number }) {
  return (
    <Box role="status" aria-label="Loading" sx={cardGridSx}>
      {Array.from({ length: count }, (_, index) => (
        <Box key={index} sx={panelSx}>
          <Skeleton variant="rectangular" sx={{ aspectRatio: '16 / 7', height: 'auto' }} />
          <Box sx={{ p: 2 }}>
            <Skeleton width="70%" />
            <Skeleton width="90%" />
            <Skeleton width="40%" />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
