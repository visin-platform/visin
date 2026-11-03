import { useParams } from 'react-router-dom';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { ChatBubbleOutlined } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useTrackVisit } from '@visin/frontend-core';
import { usePageMeta } from '../hooks/usePageMeta';
import { exploreApi } from '../services/exploreApi';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileLists } from '../components/profile/ProfileLists';
import { useChatDock } from '../components/chat/chatDock';
import { homeApi } from '../services/homeApi';

const shell = {
  width: '100%',
  maxWidth: 1000,
  mx: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: { xs: 3, md: 4 }
} as const;

/**
 * A group's public page, once its owner has turned it on: its name, what it says about itself, and the
 * projects and datasets it has made public. Never who its members are.
 */
export function GroupProfilePage({ now }: { now?: Date }) {
  const { handle = '' } = useParams();
  const group = useQuery({ queryKey: ['group-profile', handle], queryFn: () => exploreApi.group(handle) });
  const chat = useChatDock();
  // Its channel is for its members; nobody else is offered a way in.
  const myGroups = useQuery({ queryKey: ['home', 'my-groups'], queryFn: homeApi.myGroups, enabled: chat.available });
  const member = Boolean(group.data && myGroups.data?.some((mine) => mine.id === group.data?.id));
  const page = group.data ?? undefined;
  usePageMeta(
    page
      ? {
          title: `${page.name} (@${page.handle}) on Visin`,
          description:
            page.description?.trim() || `${page.name} on Visin: the projects and datasets this group has made public.`
        }
      : group.isSuccess
        ? { title: 'No such group · Visin', noindex: true }
        : null
  );
  useTrackVisit(page ? { kind: 'group', id: page.id, name: page.name, path: `/g/${page.handle}` } : null);

  if (group.isPending) {
    return (
      <Box sx={shell} role="status" aria-label="Loading">
        <Skeleton variant="rounded" height={140} sx={{ borderRadius: '16px' }} />
      </Box>
    );
  }
  if (group.isError) {
    return (
      <Box sx={{ ...shell, alignItems: 'flex-start' }}>
        <Typography>Could not load this page.</Typography>
        <Button onClick={() => void group.refetch()}>Retry</Button>
      </Box>
    );
  }
  if (!page) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          No such group
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          There is no public page at this address.
        </Typography>
      </Box>
    );
  }

  const created = new Date(page.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Box sx={shell}>
      <ProfileHeader
        shareUrl={`${window.location.origin}/g/${encodeURIComponent(page.handle)}`}
        name={page.name}
        handle={page.handle}
        picture={page.picture}
        bio={page.description}
        links={page.links}
        meta={`Group since ${created}`}
        actions={
          chat.available &&
          member && (
            <Button
              variant="contained"
              size="small"
              startIcon={<ChatBubbleOutlined />}
              onClick={() => chat.openWith({ kind: 'group', groupId: page.id, title: page.name })}
            >
              Message group
            </Button>
          )
        }
      />
      <ProfileLists owner={{ owner: page.id }} cacheKey={`group:${handle}`} now={now} />
    </Box>
  );
}

export default GroupProfilePage;
