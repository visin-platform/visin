import { useConfig } from '../config/ConfigProvider';
import { useParams } from 'react-router-dom';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTrackVisit } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { exploreApi } from '../services/exploreApi';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileLists } from '../components/profile/ProfileLists';

const shell = {
  width: '100%',
  maxWidth: 1000,
  mx: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: { xs: 3, md: 4 }
} as const;

/**
 * A person's public page: who they are, and what they have made public. The same page for
 * everyone, signed in or not; the one thing it adds for its owner is the way to edit it.
 * Only public work is listed, so it reads the same to the owner as to a stranger.
 */
export function ProfilePage({ now }: { now?: Date }) {
  const { handle = '' } = useParams();
  const config = useConfig();
  const { user: me } = useAuth();
  const profile = useQuery({ queryKey: ['profile', handle], queryFn: () => exploreApi.user(handle) });
  const person = profile.data ?? undefined;
  useTrackVisit(person ? { kind: 'person', id: person.id, name: person.name, path: `/u/${person.handle}` } : null);

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

  const joined = new Date(person.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Box sx={shell}>
      <ProfileHeader
        shareUrl={
          config.AUTH_SERVICE_URL
            ? `${config.AUTH_SERVICE_URL.replace(/\/$/, '')}/auth/share/users/${encodeURIComponent(person.handle)}`
            : undefined
        }
        name={person.name}
        handle={person.handle}
        picture={person.picture}
        bio={person.bio}
        links={person.links}
        meta={`Joined ${joined}`}
        edit={me?.id === person.id ? { to: '/account/profile' } : undefined}
      />
      <ProfileLists
        owner={{ user: person.id }}
        cacheKey={`user:${handle}`}
        showActivity={person.showActivity}
        now={now}
      />
    </Box>
  );
}

export default ProfilePage;
