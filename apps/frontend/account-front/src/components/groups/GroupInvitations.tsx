import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { groupService } from '../../services/groupService';
import type { GroupRole } from '../../types/group';

export default function GroupInvitations({ groupId, canInviteOwner }: { groupId: string; canInviteOwner: boolean }) {
  const [role, setRole] = useState<GroupRole>('member');
  const [link, setLink] = useState('');
  const [copyError, setCopyError] = useState(false);
  const create = useMutation({
    mutationFn: () => groupService.createInvitation(groupId, role),
    onSuccess: invitation => { setLink(`${window.location.origin}/invite#${invitation.token}`); setCopyError(false); }
  });
  const revoke = useMutation({ mutationFn: () => groupService.revokeInvitations(groupId), onSuccess: () => setLink('') });
  const error = create.error || revoke.error;
  const busy = create.isPending || revoke.isPending;
  return <Box>
    <Typography variant="body2" sx={{ mb: 2 }}>Share a single-use invitation directly with the person you want to add. Links expire after seven days.</Typography>
    <Box sx={{ display: 'flex', gap: 2 }}>
      <TextField select size="small" label="Invitation role" value={role} onChange={event => setRole(event.target.value as GroupRole)} disabled={busy} sx={{ minWidth: 150 }}>
        {(canInviteOwner ? ['owner', 'admin', 'member'] : ['admin', 'member']).map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
      <Button disabled={busy} onClick={() => create.mutate()}>Create invite link</Button>
      <Button color="error" disabled={busy} onClick={() => revoke.mutate()}>Revoke pending invites</Button>
    </Box>
    {link && <Box sx={{ mt: 2 }}>
      <TextField fullWidth label="Invitation link" value={link} slotProps={{ input: { readOnly: true } }} />
      <Button onClick={() => navigator.clipboard.writeText(link).catch(() => setCopyError(true))}>Copy link</Button>
    </Box>}
    {copyError && <Alert severity="info">Select and copy the invitation link manually.</Alert>}
    {error && <Alert severity="error">{error.message}</Alert>}
  </Box>;
}
