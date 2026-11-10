import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { admin } from './services/admin';
interface Group {
  id: string;
  name: string;
  revision: number;
  members: { userId: string; role: string }[];
}
export default function GroupManager({ userId }: { userId: string }) {
  const [input, setInput] = useState('');
  const [id, setId] = useState('');
  const [role, setRole] = useState('member');
  const [reason, setReason] = useState('');
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-group', id],
    queryFn: () => admin<Group>(`/groups/${id}`),
    enabled: /^[a-f\d]{24}$/i.test(id),
    retry: false
  });
  useEffect(() => {
    setRole(query.data?.members.find((m) => m.userId === userId)?.role || 'member');
  }, [query.data, userId]);
  const change = useMutation({
    mutationFn: (remove: boolean) =>
      admin<Group>(`/memberships/${id}/${userId}`, remove ? 'DELETE' : 'PUT', {
        role,
        reason,
        revision: query.data!.revision
      }),
    onSuccess: (group) => {
      cache.setQueryData(['admin-group', id], group);
      void cache.invalidateQueries({ queryKey: ['admin-memberships', userId] });
      setReason('');
    }
  });
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1">Manage a group membership</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField label="Group ID" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button
          disabled={!/^[a-f\d]{24}$/i.test(input.trim())}
          onClick={() => {
            if (id === input.trim()) void query.refetch();
            else setId(input.trim());
          }}
        >
          Load group
        </Button>
      </Stack>
      {query.isError && <Alert severity="error">{query.error.message}</Alert>}
      {query.data && (
        <>
          <Typography>
            {query.data.name} · revision {query.data.revision}
          </Typography>
          <TextField select label="Group role" value={role} onChange={(e) => setRole(e.target.value)}>
            {['member', 'admin', 'owner'].map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Membership change reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Alert severity="info">
            Assign another owner before removing the last owner. Changes are recorded and require the current group
            revision.
          </Alert>
          {change.isError && <Alert severity="error">{change.error.message}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }}>
            <Button disabled={!reason.trim() || change.isPending} onClick={() => change.mutate(false)}>
              Add or update membership
            </Button>
            <Button
              disabled={!reason.trim() || change.isPending || !query.data.members.some((m) => m.userId === userId)}
              onClick={() => change.mutate(true)}
            >
              Remove membership
            </Button>
          </Stack>
        </>
      )}
    </Stack>
  );
}
