import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Chip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../../config/ConfigProvider';
import { exploreApi, type OwnerFilter } from '../../services/exploreApi';
import { cardGridSx } from '../explore/cardGrid';
import { ActivityFeed } from './ActivityFeed';
import { CardSkeletons, DatasetCard, ProjectCard } from '../explore/cards';
import { formatCount } from '../home/formatting';

const DATASETS_FETCHED = 48;

const TABS = [
  { value: 'activity', label: 'Activity' },
  { value: 'projects', label: 'Projects' },
  { value: 'datasets', label: 'Datasets' }
] as const;
type Tab = (typeof TABS)[number]['value'];

interface ProfileListsProps {
  /** Whose work: a person's, or a group's. */
  owner: OwnerFilter;
  /** Keeps one page's lists apart from another's in the cache. */
  cacheKey: string;
  /** False when the owner keeps their activity to themselves: the tab is then not there at all. */
  showActivity?: boolean;
  now?: Date;
}

/**
 * The public projects and datasets of one owner, in tabs. Only what anyone may read is listed, so it
 * reads the same to the owner as to a stranger.
 */
export function ProfileLists({ owner, cacheKey, showActivity = true, now }: ProfileListsProps) {
  const config = useConfig();
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => now ?? new Date(), [now]);
  const vision = Boolean(config.VISION_API_URL);
  const datasetsOn = Boolean(config.DATASET_API_URL);
  // A tab exists only where something can feed it.
  const available = TABS.filter((option) =>
    option.value === 'activity' ? showActivity && (vision || datasetsOn) : option.value === 'projects' ? vision : datasetsOn
  );
  const requested = params.get('tab');
  // Activity first, where there is one; else the first tab there is.
  const tab: Tab = available.find((option) => option.value === requested)?.value ?? available[0]?.value ?? 'projects';

  const projects = useQuery({
    queryKey: ['profile', cacheKey, 'projects'],
    queryFn: () => exploreApi.projects(owner),
    enabled: vision
  });
  const datasets = useQuery({
    queryKey: ['profile', cacheKey, 'datasets'],
    queryFn: () => exploreApi.datasets(DATASETS_FETCHED, owner),
    enabled: datasetsOn
  });

  if (available.length === 0) {
    return null;
  }

  const list = tab === 'datasets' ? datasets : projects;
  const count = (query: typeof projects | typeof datasets) => (query.data ? ` ${formatCount(query.data.length)}` : '');

  return (
    <>
      <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {available.map((option) => (
          <Chip
            key={option.value}
            label={option.value === 'activity' ? option.label : `${option.label}${count(option.value === 'projects' ? projects : datasets)}`}
            clickable
            color={option.value === tab ? 'primary' : 'default'}
            variant={option.value === tab ? 'filled' : 'outlined'}
            aria-pressed={option.value === tab}
            onClick={() => setParams(option.value === available[0].value ? {} : { tab: option.value }, { replace: true })}
          />
        ))}
      </Box>

      {tab === 'activity' ? (
        <ActivityFeed owner={owner} cacheKey={cacheKey} now={today} />
      ) : list.isPending ? (
        <CardSkeletons count={3} />
      ) : list.isError ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Could not load {tab}.
        </Typography>
      ) : list.data.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No public {tab} yet.
        </Typography>
      ) : (
        <Box sx={cardGridSx}>
          {tab === 'projects'
            ? projects.data!.map((project) => <ProjectCard key={project._id} project={project} now={today} />)
            : datasets.data!.map((dataset) => <DatasetCard key={dataset._id} dataset={dataset} now={today} />)}
        </Box>
      )}
    </>
  );
}
