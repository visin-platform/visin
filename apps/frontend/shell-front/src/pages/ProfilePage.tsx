import { Link as RouterLink, useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { ChatBubbleOutlined } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useTrackVisit } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { exploreApi } from '../services/exploreApi';
import { AssistantProfileEditor } from '../components/profile/AssistantProfileEditor';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileLists } from '../components/profile/ProfileLists';
import { useChatDock } from '../components/chat/chatDock';

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
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const chat = useChatDock();
  const profile = useQuery({ queryKey: ['profile', handle], queryFn: () => exploreApi.user(handle) });
  const person = profile.data ?? undefined;
  usePageMeta(
    person
      ? {
          title: `${person.name} (@${person.handle}) on Visin`,
          description:
            person.bio?.trim() ||
            `${person.name}'s profile on Visin: projects, datasets and activity they have made public.`
        }
      : profile.isSuccess
        ? { title: 'No such person · Visin', noindex: true }
        : null
  );
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
        shareUrl={`${window.location.origin}/u/${encodeURIComponent(person.handle)}`}
        name={person.name}
        handle={person.handle}
        picture={person.picture}
        bio={person.bio}
        links={person.links}
        meta={person.kind === 'assistant' ? 'Bot · AI assistant' : `Joined ${joined}`}
        edit={me?.id === person.id ? { to: '/account/profile' } : undefined}
        actions={
          <>
            {me && person.kind === 'assistant' && person.assistantId && (
              <AssistantProfileEditor
                key={`${me.id}:${person.assistantId}`}
                assistantId={person.assistantId}
                userId={person.id}
                viewerId={me.id}
                handle={person.handle}
                bio={person.bio}
                onSaved={async (savedHandle) => {
                  if (savedHandle && savedHandle !== person.handle) {
                    navigate(`/u/${encodeURIComponent(savedHandle)}`, { replace: true });
                  } else {
                    await profile.refetch();
                  }
                }}
              />
            )}
            {chat.available && me?.id !== person.id && (
              <Button
                disabled={person.kind === 'assistant' && person.paused}
                variant="contained"
                size="small"
                startIcon={<ChatBubbleOutlined />}
                onClick={() =>
                  chat.openWith(
                    person.kind === 'assistant' && person.assistantId
                      ? { kind: 'assistant', assistantId: person.assistantId, title: person.name }
                      : { kind: 'direct', handle: person.handle, name: person.name }
                  )
                }
              >
                {person.kind === 'assistant' ? `Ask ${person.name}` : 'Message'}
              </Button>
            )}
          </>
        }
      />
      {person.kind === 'assistant' &&
        person.managers?.map((manager) => (
          <Typography key={manager.handle} variant="body2">
            Managed by{' '}
            <Button component={RouterLink} to={`/u/${manager.handle}`}>
              {manager.name}
            </Button>
          </Typography>
        ))}
      {person.kind !== 'assistant' && (
        <ProfileLists
          owner={{ user: person.id }}
          cacheKey={`user:${handle}`}
          showActivity={person.showActivity}
          now={now}
        />
      )}
    </Box>
  );
}

export default ProfilePage;
