import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Chip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../../config/ConfigProvider';
import { exploreApi, type OwnerFilter } from '../../services/exploreApi';
import { cardGridSx } from '../explore/cardGrid';
import { ActivityFeed } from './ActivityFeed';
import { CardSkeletons, DatasetCard, ProjectCard } from '../explore/cards';
import { PaperRow } from './DirectoryRows';
import { panelSx } from '../home/panel';
import { formatCount } from '../home/formatting';

const DATASETS_FETCHED = 48;
const PAPERS_FETCHED = 50;

const TABS = [
  { value: 'activity', label: 'Activity' },
  { value: 'projects', label: 'Projects' },
  { value: 'datasets', label: 'Datasets' },
  { value: 'papers', label: 'Papers' }
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
  // Papers are listed by author, which a group has none of: only a person's page has the tab.
  const papersOn = vision && owner.user !== undefined;
  const available = TABS.filter((option) =>
    option.value === 'activity'
      ? showActivity && (vision || datasetsOn)
      : option.value === 'projects'
        ? vision
        : option.value === 'datasets'
          ? datasetsOn
          : papersOn
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

  const papers = useQuery({
    queryKey: ['profile', cacheKey, 'papers'],
    queryFn: () => exploreApi.publicPapers({ user: owner.user, page: 1, limit: PAPERS_FETCHED }),
    enabled: papersOn
  });

  if (available.length === 0) {
    return null;
  }

  const list = tab === 'datasets' ? datasets : tab === 'papers' ? papers : projects;
  const countOf = (value: Tab): number | undefined =>
    value === 'papers' ? papers.data?.pagination.total : value === 'projects' ? projects.data?.length : value === 'datasets' ? datasets.data?.length : undefined;
  const listCount = tab === 'papers' ? papers.data?.papers.length : countOf(tab);
  const count = (value: Tab) => (countOf(value) === undefined ? '' : ` ${formatCount(countOf(value)!)}`);

  return (
    <>
      <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {available.map((option) => (
          <Chip
            key={option.value}
            label={`${option.label}${count(option.value)}`}
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
      ) : listCount === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No public {tab} yet.
        </Typography>
      ) : tab === 'papers' ? (
        <Box sx={panelSx}>
          {papers.data!.papers.map((paper) => (
            <PaperRow key={paper.id} paper={paper} />
          ))}
        </Box>
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
