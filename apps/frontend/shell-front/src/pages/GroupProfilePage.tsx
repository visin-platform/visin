import { useParams } from 'react-router-dom';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { exploreApi } from '../services/exploreApi';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { ProfileLists } from '../components/profile/ProfileLists';

const shell = { width: '100%', maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 } } as const;

/**
 * A group's public page, once its owner has turned it on: its name, what it says about itself, and the
 * projects and datasets it has made public. Never who its members are.
 */
export function GroupProfilePage({ now }: { now?: Date }) {
  const { handle = '' } = useParams();
  const group = useQuery({ queryKey: ['group-profile', handle], queryFn: () => exploreApi.group(handle) });
  const page = group.data ?? undefined;

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
      <ProfileHeader name={page.name} handle={page.handle} bio={page.description} meta={`Group since ${created}`} />
      <ProfileLists owner={{ owner: page.id }} cacheKey={`group:${handle}`} now={now} />
    </Box>
  );
}

export default GroupProfilePage;
