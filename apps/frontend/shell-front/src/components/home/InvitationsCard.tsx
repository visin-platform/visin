import { Alert, Box, Button, Typography } from '@mui/material';
import { GroupAdd } from '@mui/icons-material';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { homeApi, type HomeInvitation } from '../../services/homeApi';
import { panelSx } from './panel';

interface InvitationsCardProps {
  query: UseQueryResult<HomeInvitation[]>;
}

/**
 * Invitations waiting for an answer, at the top of the home page: for someone
 * invited to a team, joining it is the first thing to do. Nothing shows while
 * there are none, or when group-service cannot be reached.
 */
export function InvitationsCard({ query }: InvitationsCardProps) {
  const queryClient = useQueryClient();
  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => homeApi.answerInvitation(id, accept),
    // Joining changes the viewer's groups and projects as well; the whole page refreshes.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home'] })
  });

  if (!query.data || query.data.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="home-invitations" sx={{ ...panelSx, p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <GroupAdd color="primary" />
        <Typography id="home-invitations" component="h2" variant="h6">
          {query.data.length === 1 ? 'You are invited to a group' : 'You are invited to groups'}
        </Typography>
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {query.data.map((invitation) => (
          <Box component="li" key={invitation.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>
                {invitation.groupName} <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>as {invitation.role}</Typography>
              </Typography>
              {invitation.invitedBy && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Invited by {invitation.invitedBy}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ id: invitation.id, accept: true })}
                aria-label={`Join ${invitation.groupName}`}
              >
                Join
              </Button>
              <Button
                size="small"
                disabled={answer.isPending}
                onClick={() => answer.mutate({ id: invitation.id, accept: false })}
                aria-label={`Decline ${invitation.groupName}`}
              >
                Decline
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
      {answer.error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {answer.error.message}
        </Alert>
      )}
    </Box>
  );
}
