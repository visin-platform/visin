import { useMemo } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, Chip, Link, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';
import { exploreApi } from '../services/exploreApi';
import { homeApi } from '../services/homeApi';
import { cardGridSx } from '../components/explore/cardGrid';
import { CardSkeletons, DatasetCard, ProjectCard } from '../components/explore/cards';
import { LeaderboardPanel } from '../components/explore/LeaderboardPanel';
import { VisitorBanner } from '../components/explore/VisitorBanner';
import { FindingsSection } from '../components/home/FindingsSection';

/** Shown in "All"; a single kind shows up to the fetched amount. */
const OVERVIEW_COUNT = 6;
const DATASETS_FETCHED = 24;
const FINDINGS_SHOWN = 4;
/** Asked for more than shown: some are dropped for belonging to private projects. */
const FINDINGS_FETCHED = 24;
const LEADERBOARD_SHOWN = 5;

const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'projects', label: 'Projects' },
  { value: 'datasets', label: 'Datasets' }
] as const;
type Kind = (typeof KINDS)[number]['value'];

interface ExplorePageProps {
  /** Injectable so a test need not freeze the clock. */
  now?: Date;
}

interface ShelfProps {
  id: string;
  title: string;
  seeAll: string;
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  count: number;
  empty: string;
  error: string;
  children: React.ReactNode;
}

/** A titled grid of cards with what stands in for them while loading, failing or empty. */
function Shelf({ id, title, seeAll, query, count, empty, error, children }: ShelfProps) {
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
        <Link component={RouterLink} to={seeAll} underline="none" aria-label={`See all ${title.toLowerCase()}`} sx={{ fontSize: 14, fontWeight: 600 }}>
          See all
        </Link>
      </Box>
      {query.isPending ? (
        <CardSkeletons count={3} />
      ) : query.isError || count === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 0.5, py: 1 }}>
          {query.isError ? error : empty}
        </Typography>
      ) : (
        <Box sx={cardGridSx}>{children}</Box>
      )}
    </Box>
  );
}

/**
 * What anyone can see without an account: public projects and datasets as cards,
 * the top of the leaderboard and the latest written findings beside them. It is
 * a visitor's front page and a member's second tab, so it never assumes a session.
 *
 * Each part is fed by one service and left out where that service's URL is not
 * configured, rather than shown failing.
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

  const projects = useQuery({ queryKey: ['explore', 'projects'], queryFn: () => exploreApi.projects(), enabled: vision });
  const datasets = useQuery({
    queryKey: ['explore', 'datasets'],
    queryFn: () => exploreApi.datasets(DATASETS_FETCHED),
    enabled: datasetsOn
  });
  const leaderboard = useQuery({
    queryKey: ['explore', 'leaderboard'],
    queryFn: () => exploreApi.leaderboard(LEADERBOARD_SHOWN),
    enabled: vision
  });
  const projectNames = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project._id, project.name])),
    [projects.data]
  );

  // The findings list also returns a member's private ones: Explore keeps only those of
  // the public projects it shows, so it reads the same signed in or out. Fetching waits
  // for the projects so the first answer is already the filtered one.
  const findings = useQuery({
    queryKey: ['explore', 'findings'],
    queryFn: () => homeApi.findings(FINDINGS_FETCHED),
    enabled: vision && !projects.isPending,
    select: (all) => all.filter((finding) => projectNames.has(finding.projectId)).slice(0, FINDINGS_SHOWN)
  });

  const showProjects = vision && kind !== 'datasets';
  const showDatasets = datasetsOn && kind !== 'projects';
  const limit = kind === 'all' ? OVERVIEW_COUNT : Infinity;
  const projectCards = (projects.data ?? []).slice(0, limit);
  const datasetCards = (datasets.data ?? []).slice(0, limit);
  const landing = config.LANDING_FRONT_URL?.replace(/\/$/, '');

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
          <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {KINDS.filter((option) => option.value === 'all' || (option.value === 'projects' ? vision : datasetsOn)).map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                clickable
                color={option.value === kind ? 'primary' : 'default'}
                variant={option.value === kind ? 'filled' : 'outlined'}
                aria-pressed={option.value === kind}
                onClick={() => setParams(option.value === 'all' ? {} : { type: option.value }, { replace: true })}
              />
            ))}
          </Box>

          {showProjects && (
            <Shelf
              id="explore-projects"
              title="Projects"
              seeAll="/projects"
              query={projects}
              count={projectCards.length}
              empty="No public projects yet."
              error="Could not load projects."
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
              seeAll="/datasets"
              query={datasets}
              count={datasetCards.length}
              empty="No public datasets yet."
              error="Could not load datasets."
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
