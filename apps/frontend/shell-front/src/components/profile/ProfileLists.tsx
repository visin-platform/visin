import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Chip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../../config/ConfigProvider';
import { exploreApi, type OwnerFilter } from '../../services/exploreApi';
import { cardGridSx } from '../explore/cardGrid';
import { CardSkeletons, DatasetCard, ProjectCard } from '../explore/cards';
import { formatCount } from '../home/formatting';

const DATASETS_FETCHED = 48;

const TABS = [
  { value: 'projects', label: 'Projects' },
  { value: 'datasets', label: 'Datasets' }
] as const;
type Tab = (typeof TABS)[number]['value'];

interface ProfileListsProps {
  /** Whose work: a person's, or a group's. */
  owner: OwnerFilter;
  /** Keeps one page's lists apart from another's in the cache. */
  cacheKey: string;
  now?: Date;
}

/**
 * The public projects and datasets of one owner, in tabs. Only what anyone may read is listed, so it
 * reads the same to the owner as to a stranger.
 */
export function ProfileLists({ owner, cacheKey, now }: ProfileListsProps) {
  const config = useConfig();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = TABS.some((option) => option.value === requested) ? (requested as Tab) : 'projects';
  const today = useMemo(() => now ?? new Date(), [now]);
  const vision = Boolean(config.VISION_API_URL);
  const datasetsOn = Boolean(config.DATASET_API_URL);

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

  if (!vision && !datasetsOn) {
    return null;
  }

  const list = tab === 'projects' ? projects : datasets;
  const count = (query: typeof projects | typeof datasets) => (query.data ? ` ${formatCount(query.data.length)}` : '');

  return (
    <>
      <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {TABS.filter((option) => (option.value === 'projects' ? vision : datasetsOn)).map((option) => (
          <Chip
            key={option.value}
            label={`${option.label}${count(option.value === 'projects' ? projects : datasets)}`}
            clickable
            color={option.value === tab ? 'primary' : 'default'}
            variant={option.value === tab ? 'filled' : 'outlined'}
            aria-pressed={option.value === tab}
            onClick={() => setParams(option.value === 'projects' ? {} : { tab: option.value }, { replace: true })}
          />
        ))}
      </Box>

      {list.isPending ? (
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
