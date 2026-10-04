import { ReactNode, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Link, Skeleton, Typography, useTheme } from '@mui/material';
import { AutoAwesome, Folder, Insights, ModelTraining, PhotoLibrary, Science } from '@mui/icons-material';
import { livePalette } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { exploreApi, type ActivityItem, type ActivityProject, type OwnerFilter } from '../../services/exploreApi';
import { formatRelative } from '../home/formatting';
import { panelSx } from '../home/panel';
import { RowIcon } from '../home/HomeSection';

const projectPath = (project: ActivityProject): string => `/projects/${project.slug || project.id}`;

const ProjectLink = ({ project }: { project: ActivityProject }) => (
  <Link component={RouterLink} to={projectPath(project)} sx={{ fontWeight: 600 }}>
    {project.name}
  </Link>
);

/** The line itself: what was done, with the things it names as links. */
function describe(item: ActivityItem): { icon: ReactNode; sentence: ReactNode } {
  switch (item.kind) {
    case 'project.created':
      return {
        icon: <Folder fontSize="small" />,
        sentence: (
          <>
            Created the project <ProjectLink project={item.project} />
          </>
        )
      };
    case 'finding.posted': {
      const assistant = item.finding.authorKind === 'assistant';
      return {
        icon: assistant ? <AutoAwesome fontSize="small" /> : <Insights fontSize="small" />,
        sentence: (
          <>
            Posted a finding{' '}
            <Link component={RouterLink} to={`${projectPath(item.project)}?tab=analysis`} sx={{ fontWeight: 600 }}>
              “{item.finding.title}”
            </Link>{' '}
            in <ProjectLink project={item.project} />
            {/* Whether software wrote it is stated in words, never left to the icon. */}
            {assistant && ` · via ${item.finding.authorLabel}`}
          </>
        )
      };
    }
    case 'training.run':
      return {
        icon: <ModelTraining fontSize="small" />,
        sentence: (
          <>
            {item.count === 1 ? 'Ran a training' : `Ran ${item.count} trainings`} in <ProjectLink project={item.project} />
          </>
        )
      };
    case 'evaluation.recorded':
      return {
        icon: <Science fontSize="small" />,
        sentence: (
          <>
            Recorded {item.evaluation.status === 'failed' ? 'a failed evaluation' : 'an evaluation'}
            {item.evaluation.suite && ` on ${item.evaluation.suite.slug}@${item.evaluation.suite.version}`} in{' '}
            <ProjectLink project={item.project} />
          </>
        )
      };
    case 'dataset.created':
      return {
        icon: <PhotoLibrary fontSize="small" />,
        sentence: (
          <>
            Created the dataset{' '}
            <Link component={RouterLink} to={`/datasets/${item.dataset.id}`} sx={{ fontWeight: 600 }}>
              {item.dataset.name}
            </Link>
          </>
        )
      };
  }
}

/** Today, Yesterday, else the day in the viewer's language. */
function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(days > 300 ? { year: 'numeric' } : {}) });
}

interface ActivityFeedProps {
  owner: OwnerFilter;
  cacheKey: string;
  now?: Date;
}

/**
 * What a person or a group has been doing in public, grouped by day. Every line is about something public
 * right now, so a project made private is gone from it, and it reads the same to its owner as to a stranger.
 */
export function ActivityFeed({ owner, cacheKey, now }: ActivityFeedProps) {
  const theme = useTheme();
  const today = useMemo(() => now ?? new Date(), [now]);
  const activity = useQuery({ queryKey: ['profile', cacheKey, 'activity'], queryFn: () => exploreApi.activity(owner) });

  if (activity.isPending) {
    return (
      <Box role="status" aria-label="Loading" sx={panelSx}>
        {[0, 1, 2].map((row) => (
          <Box key={row} sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.5 }}>
            <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '12px' }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="70%" />
              <Skeleton width="25%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }
  if (activity.isError) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Could not load activity.
        </Typography>
        <Button size="small" onClick={() => void activity.refetch()}>
          Retry
        </Button>
      </Box>
    );
  }
  if (activity.data.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Nothing public yet.
      </Typography>
    );
  }

  const days: { label: string; items: ActivityItem[] }[] = [];
  for (const item of activity.data) {
    const label = dayLabel(item.at, today);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }
  const color = livePalette(theme).primary.main;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {days.map(({ label, items }) => (
        <Box component="section" key={label} aria-label={label}>
          <Typography component="h2" sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', px: 0.5, mb: 1 }}>
            {label}
          </Typography>
          <Box component="ul" sx={{ ...panelSx, listStyle: 'none', m: 0, p: 0 }}>
            {items.map((item, index) => {
              const { icon, sentence } = describe(item);
              return (
                <Box
                  component="li"
                  key={`${item.kind}:${item.at}:${index}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderTop: index === 0 ? 0 : 1, borderColor: 'divider' }}
                >
                  <RowIcon color={color}>{icon}</RowIcon>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ overflowWrap: 'anywhere' }}>{sentence}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {formatRelative(item.at, today)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
