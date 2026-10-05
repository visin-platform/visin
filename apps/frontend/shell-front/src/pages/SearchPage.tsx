import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, Button, InputAdornment, Link, TextField, Typography } from '@mui/material';
import { Search } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../config/ConfigProvider';
import { exploreApi } from '../services/exploreApi';
import { cardGridSx } from '../components/explore/cardGrid';
import { CardSkeletons, DatasetCard, ProjectCard } from '../components/explore/cards';
import { HomeSection, SectionBody } from '../components/home/HomeSection';
import { GroupRow, PaperRow, PersonRow } from '../components/profile/DirectoryRows';

/** Results per kind: a taste, with a link to all of it. */
const SHOWN = 6;
/** Two characters at least, as the services want. */
const MIN_LENGTH = 2;

/** One kind of result: its heading, what stands in for it while loading or when empty, and the way to all of it. */
function Shelf({
  id,
  title,
  seeAll,
  query,
  count,
  empty,
  error,
  children
}: {
  id: string;
  title: string;
  seeAll?: string;
  query: { isPending: boolean; isError: boolean };
  count: number;
  empty: string;
  error: string;
  children: React.ReactNode;
}) {
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
        {seeAll && count >= SHOWN && (
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
        <Box sx={cardGridSx}>{children}</Box>
      )}
    </Box>
  );
}

/**
 * Everything the app can find for some words, by kind: people and groups with a public page, public projects and
 * datasets. The same for everyone, signed in or not. Each kind is asked of its own service and left out where that
 * service's address is not configured.
 */
export function SearchPage({ now }: { now?: Date }) {
  const config = useConfig();
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [typed, setTyped] = useState(q);
  useEffect(() => setTyped(q), [q]);
  const today = useMemo(() => now ?? new Date(), [now]);
  const ready = q.length >= MIN_LENGTH;

  const people = Boolean(config.AUTH_SERVICE_URL);
  const groups = Boolean(config.GROUP_SERVICE_URL);
  const vision = Boolean(config.VISION_API_URL);
  const datasetsOn = Boolean(config.DATASET_API_URL);

  const peopleResults = useQuery({ queryKey: ['search', 'people', q], queryFn: () => exploreApi.searchPeople(q, SHOWN), enabled: ready && people });
  const groupResults = useQuery({ queryKey: ['search', 'groups', q], queryFn: () => exploreApi.searchGroups(q, SHOWN), enabled: ready && groups });
  const projectResults = useQuery({
    queryKey: ['search', 'projects', q],
    queryFn: () => exploreApi.publicProjects({ search: q, sort: 'updated', page: 1, limit: SHOWN }),
    enabled: ready && vision
  });
  const datasetResults = useQuery({
    queryKey: ['search', 'datasets', q],
    queryFn: () => exploreApi.publicDatasets({ search: q, page: 1, limit: SHOWN }),
    enabled: ready && datasetsOn
  });

  const paperResults = useQuery({
    queryKey: ['search', 'papers', q],
    queryFn: () => exploreApi.publicPapers({ search: q, page: 1, limit: SHOWN }),
    enabled: ready && vision
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setParams(typed.trim() ? { q: typed.trim() } : {}, { replace: true });
  };
  const exploreMore = (type: 'projects' | 'datasets') => `/explore?${new URLSearchParams({ q, type })}`;

  return (
    <Box sx={{ width: '100%', maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 } }}>
      <Box component="form" role="search" onSubmit={submit} sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search people, groups, projects, datasets and papers"
          slotProps={{
            htmlInput: { 'aria-label': 'Search Visin' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              )
            }
          }}
        />
        <Button type="submit" variant="contained">
          Search
        </Button>
      </Box>

      {!ready ? (
        <Typography sx={{ color: 'text.secondary' }}>
          {q ? `Type at least ${MIN_LENGTH} characters to search.` : 'Search for people, groups, projects, datasets and papers.'}
          {(people || groups) && (
            <>
              {' '}
              Or <Link component={RouterLink} to="/people">browse everyone</Link>.
            </>
          )}
        </Typography>
      ) : (
        <>
          {people && (
            <HomeSection id="search-people" title="People">
              <SectionBody
                query={peopleResults}
                items={peopleResults.data}
                empty={`No people match “${q}”.`}
                error="Could not search people."
              >
                {(person) => <PersonRow key={person.id} person={person} />}
              </SectionBody>
            </HomeSection>
          )}

          {groups && (
            <HomeSection id="search-groups" title="Groups">
              <SectionBody
                query={groupResults}
                items={groupResults.data}
                empty={`No groups match “${q}”.`}
                error="Could not search groups."
              >
                {(group) => <GroupRow key={group.id} group={group} />}
              </SectionBody>
            </HomeSection>
          )}

          {vision && (
            <Shelf
              id="search-projects"
              title="Projects"
              seeAll={exploreMore('projects')}
              query={projectResults}
              count={projectResults.data?.projects.length ?? 0}
              empty={`No public projects match “${q}”.`}
              error="Could not search projects."
            >
              {projectResults.data?.projects.map((project) => <ProjectCard key={project._id} project={project} now={today} />)}
            </Shelf>
          )}

          {vision && (
            <HomeSection id="search-papers" title="Papers" seeAll={paperResults.data?.papers.length === SHOWN ? { to: `/papers?${new URLSearchParams({ q })}`, label: 'See all papers' } : undefined}>
              <SectionBody
                query={paperResults}
                items={paperResults.data?.papers}
                empty={`No public papers match “${q}”.`}
                error="Could not search papers."
              >
                {(paper) => <PaperRow key={paper.id} paper={paper} />}
              </SectionBody>
            </HomeSection>
          )}

          {datasetsOn && (
            <Shelf
              id="search-datasets"
              title="Datasets"
              seeAll={exploreMore('datasets')}
              query={datasetResults}
              count={datasetResults.data?.datasets.length ?? 0}
              empty={`No public datasets match “${q}”.`}
              error="Could not search datasets."
            >
              {datasetResults.data?.datasets.map((dataset) => <DatasetCard key={dataset._id} dataset={dataset} now={today} />)}
            </Shelf>
          )}

          {!people && !groups && !vision && !datasetsOn && (
            <Typography sx={{ color: 'text.secondary' }}>Nothing to search here yet.</Typography>
          )}
        </>
      )}
    </Box>
  );
}

export default SearchPage;
