import { Alert, Box, Button, List, ListItem, ListItemText, Typography } from '@mui/material';
import { Panel } from '@visin/frontend-core';
import { useAnswerInvitation, useMyInvitations } from '../../hooks/useGroups';

/**
 * Invitations addressed to you, from a group's owner or admin who found you
 * with "Add member". Nothing shows while there are none.
 */
export default function MyInvitations() {
  const invitations = useMyInvitations();
  const answer = useAnswerInvitation();

  if (!invitations.data || invitations.data.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="my-invitations" sx={{ mb: 3 }}>
      <Typography id="my-invitations" component="h2" variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Invitations for you
      </Typography>
      <Panel>
        <List disablePadding>
          {invitations.data.map((invitation) => (
            <ListItem
              key={invitation.id}
              sx={{ gap: 1, flexWrap: 'wrap', '& + &': { borderTop: 1, borderColor: 'divider' } }}
            >
              <ListItemText
                primary={`Join ${invitation.groupName} as ${invitation.role}`}
                secondary={invitation.invitedBy ? `Invited by ${invitation.invitedBy}` : undefined}
                sx={{ flex: '1 1 240px' }}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ id: invitation.id, accept: true })}
                  aria-label={`Accept the invitation to ${invitation.groupName}`}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  disabled={answer.isPending}
                  onClick={() => answer.mutate({ id: invitation.id, accept: false })}
                  aria-label={`Decline the invitation to ${invitation.groupName}`}
                >
                  Decline
                </Button>
              </Box>
            </ListItem>
          ))}
        </List>
      </Panel>
      {answer.error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {answer.error.message}
        </Alert>
      )}
    </Box>
  );
}
