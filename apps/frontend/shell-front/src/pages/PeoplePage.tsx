import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom';
import { Box, Pagination, PaginationItem, Tab, Tabs, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../config/ConfigProvider';
import { usePageMeta } from '../hooks/usePageMeta';
import { exploreApi } from '../services/exploreApi';
import { HomeSection, SectionBody } from '../components/home/HomeSection';
import { GroupRow, PersonRow } from '../components/profile/DirectoryRows';

const PAGE_SIZE = 24;

/** The two directories, each at an address of its own so a search engine can tell them apart. */
const PEOPLE_PATH = '/people';
const GROUPS_PATH = '/people/groups';

/** The page asked for in the address; anything that is not a whole number from 1 is the first. */
const pageOf = (value: string | null): number => {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
};

/**
 * Everyone with a public page, and every group with one, in handle order and a page at a time. It is the way in for
 * a visitor, and for a search engine, to pages nothing else links to: every row is a plain link, and so is every page
 * number. The same for everyone, signed in or not, and each part is left out where its service is not configured.
 */
export function PeoplePage() {
  const config = useConfig();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const people = Boolean(config.AUTH_SERVICE_URL);
  const groups = Boolean(config.GROUP_SERVICE_URL);
  // A kind that is not configured falls back to the other, so the page is never a dead end.
  const showGroups = groups && (pathname === GROUPS_PATH || !people);
  const page = pageOf(params.get('page'));
  const base = showGroups ? GROUPS_PATH : PEOPLE_PATH;

  const peopleList = useQuery({
    queryKey: ['directory', 'people', page],
    queryFn: () => exploreApi.directoryPeople(page, PAGE_SIZE),
    enabled: people && !showGroups
  });
  const groupList = useQuery({
    queryKey: ['directory', 'groups', page],
    queryFn: () => exploreApi.directoryGroups(page, PAGE_SIZE),
    enabled: showGroups
  });
  const current = showGroups ? groupList : peopleList;
  const pagination = current.data?.pagination;
  const empty = current.isSuccess && (current.data.pagination.total === 0 || page > current.data.pagination.pages);

  const what = showGroups ? 'Groups' : 'People';
  usePageMeta({
    title: `${what} on Visin${page > 1 ? ` · page ${page}` : ''}`,
    description: showGroups
      ? 'Browse the groups that share computer-vision projects, datasets and findings on Visin.'
      : 'Browse the people who share computer-vision projects, datasets and findings on Visin.',
    // A page past the end, or no one at all, has nothing to index.
    noindex: empty && page > 1,
    search: page > 1 ? `?page=${page}` : ''
  });

  const href = (target: number) => (target > 1 ? `${base}?page=${target}` : base);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1000,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2, md: 3 }
      }}
    >
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {what}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {showGroups
            ? 'Groups that chose to have a public page. Who is in a group is never shown.'
            : 'People who chose to have a public page, and the work they have made public.'}
        </Typography>
      </Box>

      {people && groups && (
        <Tabs value={showGroups ? GROUPS_PATH : PEOPLE_PATH} aria-label="Directory">
          <Tab component={RouterLink} to={PEOPLE_PATH} value={PEOPLE_PATH} label="People" />
          <Tab component={RouterLink} to={GROUPS_PATH} value={GROUPS_PATH} label="Groups" />
        </Tabs>
      )}

      {!people && !groups ? (
        <Typography sx={{ color: 'text.secondary' }}>Nothing to list here yet.</Typography>
      ) : (
        <HomeSection id="directory-list" title={pagination ? `${pagination.total} ${what.toLowerCase()}` : what}>
          {showGroups ? (
            <SectionBody
              query={groupList}
              items={empty ? [] : groupList.data?.groups}
              empty={page > 1 ? 'There is nothing on this page.' : 'No groups have a public page yet.'}
              error="Could not load the groups."
            >
              {(group) => <GroupRow key={group.id} group={group} />}
            </SectionBody>
          ) : (
            <SectionBody
              query={peopleList}
              items={empty ? [] : peopleList.data?.people}
              empty={page > 1 ? 'There is nothing on this page.' : 'Nobody has a public page yet.'}
              error="Could not load the people."
            >
              {(person) => <PersonRow key={person.id} person={person} />}
            </SectionBody>
          )}
        </HomeSection>
      )}

      {pagination && pagination.pages > 1 && (
        <Pagination
          page={Math.min(page, pagination.pages)}
          count={pagination.pages}
          sx={{ alignSelf: 'center' }}
          renderItem={(item) => <PaginationItem {...item} component={RouterLink} to={href(item.page ?? 1)} />}
        />
      )}
    </Box>
  );
}

export default PeoplePage;
