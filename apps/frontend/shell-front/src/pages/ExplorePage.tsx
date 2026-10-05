import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, Button, Chip, InputAdornment, Link, MenuItem, TextField, Typography } from '@mui/material';
import { Search } from '@mui/icons-material';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';
import { exploreApi, type Pagination } from '../services/exploreApi';
import type { HomeFinding } from '../services/homeApi';
import { cardGridSx } from '../components/explore/cardGrid';
import { CardSkeletons, DatasetCard, ProjectCard } from '../components/explore/cards';
import { LeaderboardPanel } from '../components/explore/LeaderboardPanel';
import { VisitorBanner } from '../components/explore/VisitorBanner';
import { FindingsSection } from '../components/home/FindingsSection';

/** Shown per kind in "All"; a single kind pages through everything, this many at a time. */
const OVERVIEW_COUNT = 6;
const PAGE_SIZE = 12;
const FINDINGS_SHOWN = 4;
const LEADERBOARD_SHOWN = 5;
/** Waits for a pause in typing before asking, so a word is one question and not one per letter. */
const SEARCH_DELAY_MS = 300;

const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'projects', label: 'Projects' },
  { value: 'datasets', label: 'Datasets' }
] as const;
type Kind = (typeof KINDS)[number]['value'];

const SORTS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Newest' }
] as const;
type Sort = (typeof SORTS)[number]['value'];

interface ExplorePageProps {
  /** Injectable so a test need not freeze the clock. */
  now?: Date;
}

interface ShelfProps {
  id: string;
  title: string;
  /** Where "See all" leads; left out where this already is everything. */
  seeAll?: string;
  query: { isPending: boolean; isError: boolean };
  count: number;
  empty: string;
  error: string;
  /** More pages to load, and how; a shelf that is only a taste has neither. */
  more?: { available: boolean; loading: boolean; load: () => void };
  children: React.ReactNode;
}

/** A titled grid of cards with what stands in for them while loading, failing or empty. */
function Shelf({ id, title, seeAll, query, count, empty, error, more, children }: ShelfProps) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, px: 0.5, mb: 1 }}>
        <Typography
          id={id}
          component="h2"
          sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          {title}
        </Typography>
        {seeAll && (
          <Link component={RouterLink} to={seeAll} underline="none" aria-label={`See all ${title.toLowerCase()}`} sx={{ fontSize: 14, fontWeight: 600 }}>
            See all
          </Link>
        )}
      </Box>
      {query.isPending ? (
        <CardSkeletons count={3} />
      ) : query.isError || count === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5, py: 1 }}>
          {query.isError ? error : empty}
        </Typography>
      ) : (
        <>
          <Box sx={cardGridSx}>{children}</Box>
          {more?.available && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" disabled={more.loading} onClick={more.load}>
                {more.loading ? 'Loading…' : 'Show more'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

const hasMore = (pages: { pagination: Pagination }[] | undefined): boolean => {
  const last = pages?.[pages.length - 1]?.pagination;
  return Boolean(last && last.page < last.pages);
};

/**
 * What anyone can see without an account: public projects and datasets as cards, with search, an order and
 * paging, the top of the leaderboard and the latest written findings beside them. It is a visitor's front page
 * and a member's second tab, so it never assumes a session, and what it lists is the same for everyone.
 *
 * Each part is fed by one service and left out where that service's URL is not configured, rather than shown
 * failing. The state that makes a view shareable (kind, search, order) lives in the address.
 */
export function ExplorePage({ now }: ExplorePageProps) {
  const config = useConfig();
  const { isAuthenticated, isLoading, signup } = useAuth();
  const vision = Boolean(config.VISION_API_URL);
  const datasetsOn = Boolean(config.DATASET_API_URL);
  const today = useMemo(() => now ?? new Date(), [now]);
  const [params, setParams] = useSearchParams();
  const requested = params.get('type');
  const kind: Kind = KINDS.some((option) => option.value === requested) ? (requested as Kind) : 'all';
  const requestedSort = params.get('sort');
  const sort: Sort = SORTS.some((option) => option.value === requestedSort) ? (requestedSort as Sort) : 'updated';
  const search = params.get('q')?.trim() ?? '';

  const update = (changes: Record<string, string | undefined>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true }
    );

  // What is typed shows at once; the address (and so the question) follows a pause.
  const [typed, setTyped] = useState(search);
  useEffect(() => setTyped(search), [search]);
  useEffect(() => {
    if (typed.trim() === search) return;
    const timer = setTimeout(() => update({ q: typed.trim() || undefined }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // `update` only reads and writes the address; typing is what restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, search]);

  const projects = useInfiniteQuery({
    queryKey: ['explore', 'projects', search, sort],
    queryFn: ({ pageParam }) => exploreApi.publicProjects({ search, sort, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined),
    enabled: vision
  });
  const datasets = useInfiniteQuery({
    queryKey: ['explore', 'datasets', search],
    queryFn: ({ pageParam }) => exploreApi.publicDatasets({ search, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined),
    enabled: datasetsOn
  });
  const leaderboard = useQuery({
    queryKey: ['explore', 'leaderboard'],
    queryFn: () => exploreApi.leaderboard(LEADERBOARD_SHOWN),
    enabled: vision
  });
  const latestFindings = useQuery({
    queryKey: ['explore', 'findings'],
    queryFn: () => exploreApi.publicFindings(FINDINGS_SHOWN),
    enabled: vision
  });
  // The findings panel is the home page's, which reads its own row shape.
  const findings = useQuery({
    queryKey: ['explore', 'findings'],
    queryFn: () => exploreApi.publicFindings(FINDINGS_SHOWN),
    enabled: vision,
    select: (rows): HomeFinding[] =>
      rows.map((row) => ({
        _id: row.id,
        projectId: row.project.id,
        trainingId: row.trainingId,
        title: row.title,
        authorKind: row.authorKind,
        authorLabel: row.authorLabel,
        createdAt: row.createdAt
      }))
  });
  const projectNames = useMemo(
    () => new Map((latestFindings.data ?? []).map((row) => [row.project.id, row.project.name])),
    [latestFindings.data]
  );

  const showProjects = vision && kind !== 'datasets';
  const showDatasets = datasetsOn && kind !== 'projects';
  const everything = kind !== 'all';
  const projectCards = (projects.data?.pages.flatMap((page) => page.projects) ?? []).slice(0, everything ? Infinity : OVERVIEW_COUNT);
  const datasetCards = (datasets.data?.pages.flatMap((page) => page.datasets) ?? []).slice(0, everything ? Infinity : OVERVIEW_COUNT);
  const landing = config.LANDING_FRONT_URL?.replace(/\/$/, '');
  const seeAll = (value: Kind) => `?${new URLSearchParams({ ...(search ? { q: search } : {}), type: value })}`;
  const none = search ? (what: string) => `No public ${what} match “${search}”.` : (what: string) => `No public ${what} yet.`;

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 }, minWidth: 0 }}>
      {/* Not while the session is still being checked: it would flash for someone signed in. */}
      {!isLoading && !isAuthenticated && (
        <VisitorBanner onSignup={signup} aboutUrl={landing ? `${landing}/about` : undefined} />
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px' },
          gap: { xs: 3, md: 4 },
          alignItems: 'start'
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 }, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexGrow: 1 }}>
              {KINDS.filter((option) => option.value === 'all' || (option.value === 'projects' ? vision : datasetsOn)).map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  clickable
                  color={option.value === kind ? 'primary' : 'default'}
                  variant={option.value === kind ? 'filled' : 'outlined'}
                  aria-pressed={option.value === kind}
                  onClick={() => update({ type: option.value === 'all' ? undefined : option.value })}
                />
              ))}
            </Box>
            {showProjects && (
              <TextField
                select
                size="small"
                label="Sort projects"
                value={sort}
                onChange={(event) => update({ sort: event.target.value === 'updated' ? undefined : event.target.value })}
                sx={{ minWidth: 190 }}
              >
                {SORTS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              size="small"
              type="search"
              placeholder="Search projects and datasets"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              slotProps={{
                htmlInput: { 'aria-label': 'Search the catalogue' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" />
                    </InputAdornment>
                  )
                }
              }}
              sx={{ width: { xs: '100%', sm: 280 } }}
            />
            {(config.AUTH_SERVICE_URL || config.GROUP_SERVICE_URL) && (
              <Link component={RouterLink} to="/people" underline="none" sx={{ fontSize: 14, fontWeight: 600 }}>
                Browse people
              </Link>
            )}
          </Box>

          {showProjects && (
            <Shelf
              id="explore-projects"
              title="Projects"
              seeAll={everything ? undefined : seeAll('projects')}
              query={projects}
              count={projectCards.length}
              empty={none('projects')}
              error="Could not load projects."
              more={
                everything
                  ? { available: hasMore(projects.data?.pages), loading: projects.isFetchingNextPage, load: () => void projects.fetchNextPage() }
                  : undefined
              }
            >
              {projectCards.map((project) => (
                <ProjectCard key={project._id} project={project} now={today} />
              ))}
            </Shelf>
          )}

          {showDatasets && (
            <Shelf
              id="explore-datasets"
              title="Datasets"
              seeAll={everything ? undefined : seeAll('datasets')}
              query={datasets}
              count={datasetCards.length}
              empty={none('datasets')}
              error="Could not load datasets."
              more={
                everything
                  ? { available: hasMore(datasets.data?.pages), loading: datasets.isFetchingNextPage, load: () => void datasets.fetchNextPage() }
                  : undefined
              }
            >
              {datasetCards.map((dataset) => (
                <DatasetCard key={dataset._id} dataset={dataset} now={today} />
              ))}
            </Shelf>
          )}

          {!showProjects && !showDatasets && (
            <Typography sx={{ color: 'text.secondary' }}>Nothing to browse here yet.</Typography>
          )}
        </Box>

        {vision && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 }, minWidth: 0 }}>
            <LeaderboardPanel query={leaderboard} />
            <FindingsSection query={findings} projectNames={projectNames} now={today} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default ExplorePage;
