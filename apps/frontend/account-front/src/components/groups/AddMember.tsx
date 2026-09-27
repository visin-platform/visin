import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemText, MenuItem, TextField, Typography } from '@mui/material';
import { Link as LinkIcon, PersonAdd } from '@mui/icons-material';
import { groupService } from '../../services/groupService';
import type { GroupRole } from '../../types/group';

const MIN_QUERY = 3;
const DEBOUNCE_MS = 300;

interface AddMemberProps {
  groupId: string;
  canInviteOwner: boolean;
}

/**
 * Find someone with a Visin account by email or name and invite them; they
 * accept in the app. Nobody with that address yet: copy an invitation link to
 * send them instead, which they can sign up from.
 */
export default function AddMember({ groupId, canInviteOwner }: AddMemberProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<GroupRole>('member');
  const [invited, setInvited] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searchKey = ['group-candidates', groupId, query];
  const candidates = useQuery({
    queryKey: searchKey,
    queryFn: () => groupService.searchCandidates(groupId, query),
    enabled: query.length >= MIN_QUERY,
    staleTime: 30_000
  });

  const invite = useMutation({
    mutationFn: ({ userId }: { userId: string; label: string }) => groupService.inviteAccount(groupId, userId, role),
    onSuccess: (_result, { label }) => {
      setInvited(label);
      // The person now has an invitation, so the search leaves them out.
      queryClient.invalidateQueries({ queryKey: ['group-candidates', groupId] });
    }
  });

  const createLink = useMutation({
    mutationFn: () => groupService.createInvitation(groupId, role),
    onSuccess: async (invitation) => {
      const url = `${window.location.origin}/invite#${invitation.token}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  });

  const roles: GroupRole[] = canInviteOwner ? ['member', 'admin', 'owner'] : ['member', 'admin'];
  const searching = query.length >= MIN_QUERY;
  const noMatch = searching && candidates.isSuccess && candidates.data.length === 0;
  const error = candidates.error || invite.error || createLink.error;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Add member
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Name or email"
          placeholder="Search people with a Visin account"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setInvited(null);
            setLink('');
          }}
          sx={{ flex: '1 1 260px' }}
          slotProps={{
            input: { endAdornment: candidates.isFetching ? <CircularProgress size={16} /> : undefined }
          }}
          helperText={text.trim().length > 0 && text.trim().length < MIN_QUERY ? 'Type at least 3 characters' : ' '}
        />
        <TextField
          select
          size="small"
          label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as GroupRole)}
          sx={{ minWidth: 130 }}
        >
          {roles.map((value) => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {invited && (
        <Alert severity="success" sx={{ mt: 1 }}>
          Invited {invited}. They can accept it on their home page or under Account → Groups.
        </Alert>
      )}

      {searching && candidates.isSuccess && candidates.data.length > 0 && (
        <List dense aria-label="Matching people" sx={{ mt: 1 }}>
          {candidates.data.map((candidate) => {
            const label = candidate.name ?? candidate.email;
            return (
              <ListItem
                key={candidate.id}
                disableGutters
                secondaryAction={
                  <Button
                    size="small"
                    startIcon={<PersonAdd />}
                    disabled={invite.isPending}
                    onClick={() => invite.mutate({ userId: candidate.id, label })}
                    aria-label={`Invite ${label}`}
                  >
                    Invite
                  </Button>
                }
              >
                <ListItemText primary={candidate.name ?? candidate.email} secondary={candidate.name ? candidate.email : undefined} />
              </ListItem>
            );
          })}
        </List>
      )}

      {noMatch && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
            No account matches “{query}”. If they have not signed up yet, send them an invitation link.
          </Typography>
          <Button size="small" startIcon={<LinkIcon />} disabled={createLink.isPending} onClick={() => createLink.mutate()}>
            Copy invitation link
          </Button>
        </Box>
      )}

      {link && (
        <Box sx={{ mt: 1 }}>
          <TextField fullWidth size="small" label="Invitation link" value={link} slotProps={{ input: { readOnly: true } }} />
          <Typography variant="caption" sx={{ color: copied ? 'success.main' : 'text.secondary' }}>
            {copied ? 'Copied. It works once and expires in seven days.' : 'Select and copy the link. It works once and expires in seven days.'}
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error.message}
        </Alert>
      )}
    </Box>
  );
}
