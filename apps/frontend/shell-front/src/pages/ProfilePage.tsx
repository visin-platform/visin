import { useMemo } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, Box, Button, Chip, Link, Skeleton, Typography } from '@mui/material';
import { Edit, Link as LinkIcon } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../config/ConfigProvider';
import { useAuth } from '../contexts/AuthContext';
import { exploreApi, type PublicUser } from '../services/exploreApi';
import { cardGridSx } from '../components/explore/cardGrid';
import { CardSkeletons, DatasetCard, ProjectCard } from '../components/explore/cards';
import { formatCount } from '../components/home/formatting';
import { panelSx } from '../components/home/panel';

const DATASETS_FETCHED = 48;

const TABS = [
  { value: 'projects', label: 'Projects' },
  { value: 'datasets', label: 'Datasets' }
] as const;
type Tab = (typeof TABS)[number]['value'];

/** `example.com/path` for `https://example.com/path/`: what a person's link says it is. */
const linkLabel = (url: string): string => {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname === '/' ? '' : pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
};

function Header({ user, own }: { user: PublicUser; own: boolean }) {
  const joined = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Box sx={{ ...panelSx, display: 'flex', gap: { xs: 2, sm: 3 }, p: { xs: 2, sm: 3 }, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <Avatar
        src={user.picture}
        alt=""
        slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
        sx={{ width: { xs: 64, sm: 96 }, height: { xs: 64, sm: 96 }, fontSize: '2rem', bgcolor: 'secondary.main' }}
      >
        {user.name.charAt(0).toUpperCase()}
      </Avatar>
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '1.9rem' }, fontWeight: 800, overflowWrap: 'anywhere' }}>
          {user.name}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>@{user.handle}</Typography>
        {user.bio && <Typography sx={{ mt: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{user.bio}</Typography>}
        {user.links.length > 0 && (
          <Box component="ul" aria-label="Links" sx={{ listStyle: 'none', m: 0, mt: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {user.links.map((url) => (
              <li key={url}>
                {/* Written by the person and shown to strangers: no referrer, and no endorsement. */}
                <Link href={url} target="_blank" rel="noopener noreferrer nofollow ugc" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <LinkIcon fontSize="small" />
                  {linkLabel(url)}
                </Link>
              </li>
            ))}
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
          Joined {joined}
        </Typography>
      </Box>
      {own && (
        <Button component={RouterLink} to="/account/profile" variant="outlined" size="small" startIcon={<Edit />}>
          Edit profile
        </Button>
      )}
    </Box>
  );
}

/**
 * A person's public page: who they are, and what they have made public. The same page for
 * everyone, signed in or not; the one thing it adds for its owner is the way to edit it.
 * Only public work is listed, so it reads the same to the owner as to a stranger.
 */
export function ProfilePage({ now }: { now?: Date }) {
  const { handle = '' } = useParams();
  const config = useConfig();
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = TABS.some((option) => option.value === requested) ? (requested as Tab) : 'projects';
  const today = useMemo(() => now ?? new Date(), [now]);
  const vision = Boolean(config.VISION_API_URL);
  const datasetsOn = Boolean(config.DATASET_API_URL);

  const profile = useQuery({ queryKey: ['profile', handle], queryFn: () => exploreApi.user(handle) });
  const person = profile.data ?? undefined;
  const projects = useQuery({
    queryKey: ['profile', handle, 'projects'],
    queryFn: () => exploreApi.projects({ user: person!.id }),
    enabled: Boolean(person) && vision
  });
  const datasets = useQuery({
    queryKey: ['profile', handle, 'datasets'],
    queryFn: () => exploreApi.datasets(DATASETS_FETCHED, { user: person!.id }),
    enabled: Boolean(person) && datasetsOn
  });

  const shell = { width: '100%', maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 } } as const;

  if (profile.isPending) {
    return (
      <Box sx={shell} role="status" aria-label="Loading">
        <Skeleton variant="rounded" height={140} sx={{ borderRadius: '16px' }} />
      </Box>
    );
  }
  if (profile.isError) {
    return (
      <Box sx={{ ...shell, alignItems: 'flex-start' }}>
        <Typography>Could not load this profile.</Typography>
        <Button onClick={() => void profile.refetch()}>Retry</Button>
      </Box>
    );
  }
  if (!person) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          No such person
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          There is no public profile at this address.
        </Typography>
      </Box>
    );
  }

  const list = tab === 'projects' ? projects : datasets;
  const count = (query: typeof projects | typeof datasets, enabled: boolean) =>
    enabled && query.data ? ` ${formatCount(query.data.length)}` : '';

  return (
    <Box sx={shell}>
      <Header user={person} own={me?.id === person.id} />

      <Box role="group" aria-label="Show" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {TABS.filter((option) => (option.value === 'projects' ? vision : datasetsOn)).map((option) => (
          <Chip
            key={option.value}
            label={`${option.label}${count(option.value === 'projects' ? projects : datasets, true)}`}
            clickable
            color={option.value === tab ? 'primary' : 'default'}
            variant={option.value === tab ? 'filled' : 'outlined'}
            aria-pressed={option.value === tab}
            onClick={() => setParams(option.value === 'projects' ? {} : { tab: option.value }, { replace: true })}
          />
        ))}
      </Box>

      {!vision && !datasetsOn ? null : list.isPending ? (
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
    </Box>
  );
}

export default ProfilePage;
