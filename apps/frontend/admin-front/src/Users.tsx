import GroupManager from './GroupManager';
import { useConfig } from './config/ConfigProvider';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { PersonAdd, People, Search } from '@mui/icons-material';
import { ConfirmDialog, EmptyState, Panel } from '@visin/frontend-core';
import StatusChip from './components/StatusChip';
import { useUserNames } from './hooks/useUserNames';
import { formatDateTime } from './utils/dateTime';
import { admin } from './services/admin';
interface User {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  status?: string;
  adminRevision?: number;
  lastLoginAt?: string;
  history?: { actorId: string; at: string; reason: string }[];
}
interface Credential {
  _id: string;
  name?: string;
  method?: string;
  createdAt: string;
  revokedAt?: string;
  lastSeenAt?: string;
}
export default function Users() {
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<User | null>(null);
  const [create, setCreate] = useState(false);
  // `?open=<id>` opens one person, from a name anywhere else in Administration (a run, a change in the history).
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const linked = useQuery({
    queryKey: ['admin-user', openId],
    queryFn: () => admin<User>(`/users/${openId}`),
    enabled: Boolean(openId && /^[a-f\d]{24}$/i.test(openId)),
    retry: false
  });
  useEffect(() => {
    if (linked.data && !selected) setSelected(linked.data);
  }, [linked.data, selected]);
  const query = useQuery({
    queryKey: ['admin-users', q, page],
    queryFn: () =>
      admin<{ users: User[]; total: number; pageSize: number }>(
        `/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      )
  });
  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        component="form"
        sx={{ alignItems: { sm: 'center' } }}
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          size="small"
          label="Find users"
          placeholder="Name, email or handle"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { sm: 320 } }}
          slotProps={{ input: { startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}
        />
        <Button type="submit" variant="outlined">
          Search
        </Button>
        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
        <Button variant="contained" startIcon={<PersonAdd />} onClick={() => setCreate(true)}>
          Create user
        </Button>
      </Stack>
      {linked.isError && <Alert severity="warning">That account could not be opened: {linked.error.message}</Alert>}
      {query.isPending ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress aria-label="Loading users" />
        </Box>
      ) : query.isError ? (
        <Alert severity="error">{query.error.message}</Alert>
      ) : (
        <Panel>
          {query.data.users.length === 0 ? (
            <EmptyState
              icon={<People />}
              title={q ? 'No one matches that search' : 'No users yet'}
              description={q ? 'Try part of a name or email address.' : 'Create the first account with Create user.'}
              action={
                q ? (
                  <Button
                    onClick={() => {
                      setSearch('');
                      setQ('');
                    }}
                  >
                    Show everyone
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    {['User', 'Roles', 'Status', 'Last sign-in', ''].map((label) => (
                      <TableCell key={label} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {query.data.users.map((user) => (
                    <TableRow key={user._id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                        </Typography>
                        {(user.firstName || user.lastName) && (
                          <Typography variant="body2" color="text.secondary">
                            {user.email}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.roles.length ? (
                          user.roles.map((role) => <Chip key={role} size="small" color="primary" label={role} sx={{ mr: 0.5 }} />)
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            User
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusChip state={user.status || 'active'} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Unknown'}
                      </TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" onClick={() => setSelected(user)}>
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}
          >
            <Typography variant="body2" color="text.secondary">
              {query.data.total} {query.data.total === 1 ? 'user' : 'users'}
              {query.data.total > query.data.pageSize &&
                ` · showing ${(page - 1) * query.data.pageSize + 1}–${Math.min(page * query.data.pageSize, query.data.total)}`}
            </Typography>
            <Box>
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button disabled={page * query.data.pageSize >= query.data.total} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </Box>
          </Stack>
        </Panel>
      )}
      {selected && (
        <UserDialog
          key={selected._id}
          user={selected}
          close={() => {
            setSelected(null);
            if (params.has('open')) {
              params.delete('open');
              setParams(params, { replace: true });
            }
            void cache.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}
      {create && (
        <CreateUser
          close={() => {
            setCreate(false);
            void cache.invalidateQueries({ queryKey: ['admin-users'] });
          }}
        />
      )}
    </Stack>
  );
}
function UserDialog({ user, close }: { user: User; close: () => void }) {
  const config = useConfig();
  const [recoveryLink, setRecoveryLink] = useState('');
  const recovery = useMutation({
    mutationFn: () =>
      admin<{ token: string }>(`/users/${user._id}/password`, 'POST', {
        reason: reason || 'Administrator assisted recovery'
      }),
    onSuccess: (data) =>
      setRecoveryLink(`${(config.AUTH_FRONT_URL || '').replace(/\/$/, '')}/recover#token=${data.token}`)
  });
  const cache = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [status, setStatus] = useState(user.status || 'active');
  const [isAdmin, setAdmin] = useState(user.roles.includes('admin'));
  const [reason, setReason] = useState('');
  const [baseline, setBaseline] = useState<User | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const detail = useQuery({ queryKey: ['admin-user', user._id], queryFn: () => admin<User>(`/users/${user._id}`) });
  const actorName = useUserNames(detail.data?.history?.map((h) => h.actorId) ?? []);
  useEffect(() => {
    if (detail.data && !detail.isFetching && !baseline) {
      setBaseline(detail.data);
      setFirstName(detail.data.firstName || '');
      setLastName(detail.data.lastName || '');
      setStatus(detail.data.status || 'active');
      setAdmin(detail.data.roles.includes('admin'));
    }
  }, [detail.data, detail.isFetching, baseline]);
  const sessions = useQuery({
    queryKey: ['admin-sessions', user._id],
    queryFn: () => admin<Credential[]>(`/users/${user._id}/sessions`)
  });
  const keys = useQuery({
    queryKey: ['admin-keys', user._id],
    queryFn: () => admin<Credential[]>(`/users/${user._id}/keys`)
  });
  const groups = useQuery({
    queryKey: ['admin-memberships', user._id],
    queryFn: () => admin<{ _id: string; name: string; members: { role: string }[] }[]>(`/users/${user._id}/memberships`)
  });
  // Only what differs from the loaded account is sent, so the history records what actually changed.
  const changes = baseline
    ? {
        ...(firstName.trim() !== (baseline.firstName || '') ? { firstName } : {}),
        ...(lastName.trim() !== (baseline.lastName || '') ? { lastName } : {}),
        ...(status !== (baseline.status || 'active') ? { status } : {}),
        ...(isAdmin !== baseline.roles.includes('admin') ? { admin: isAdmin } : {})
      }
    : {};
  const deactivating = 'status' in changes && status !== 'active';
  const save = useMutation({
    mutationFn: () =>
      admin(`/users/${user._id}`, 'PUT', { revision: baseline?.adminRevision ?? 0, ...changes, reason }),
    onSuccess: close
  });
  const revoke = useMutation({
    mutationFn: ({ path, method }: { path: string; method: string }) => admin(path, method),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['admin-sessions', user._id] });
      void cache.invalidateQueries({ queryKey: ['admin-keys', user._id] });
    }
  });
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md">
      <DialogTitle>{user.email}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Suspending or deactivating signs the account out everywhere and revokes its API keys. Name and role changes
            keep its sessions. Deactivation retains owned data and memberships; it does not erase research. The last
            active platform administrator cannot be removed.
          </Alert>
          {[detail.error, sessions.error, keys.error, groups.error, save.error, revoke.error]
            .filter(Boolean)
            .map((error, i) => (
              <Alert key={i} severity="error">
                {error?.message}
              </Alert>
            ))}
          <Typography variant="body2">User ID: {user._id}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button component={RouterLink} to={`/runs?userId=${user._id}`}>
              Vivi usage and runs
            </Button>
            <Button component={RouterLink} to={`/policies?userId=${user._id}`}>
              Vivi access and limits
            </Button>
          </Stack>
          <TextField
            disabled={!baseline}
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <TextField
            disabled={!baseline}
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <FormControlLabel
            control={<Checkbox disabled={!baseline} checked={isAdmin} onChange={(e) => setAdmin(e.target.checked)} />}
            label="Platform administrator"
          />
          <TextField
            select
            label="Account status"
            value={status}
            disabled={!baseline}
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="suspended">Suspended</MenuItem>
            <MenuItem value="deleted">Deactivated (data retained)</MenuItem>
          </TextField>
          <TextField label="Reason for change" value={reason} onChange={(e) => setReason(e.target.value)} required />
          {deactivating && (
            <TextField
              label="Type the user's email to confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          )}
          <Button disabled={!config.AUTH_FRONT_URL || recovery.isPending} onClick={() => recovery.mutate()}>
            Create one-use recovery link
          </Button>
          {recovery.isError && <Alert severity="error">{recovery.error.message}</Alert>}
          {recoveryLink && (
            <Alert severity="warning">
              Share this link through your established secure channel. It expires in 30 minutes and replaces any
              previous recovery link.
              <TextField
                fullWidth
                label="Recovery link (shown only here)"
                value={recoveryLink}
                slotProps={{ input: { readOnly: true } }}
              />
            </Alert>
          )}
          <Typography variant="h6">Sessions</Typography>
          {sessions.data?.map((s) => (
            <Stack key={s._id} direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Typography>
                {s.method} · signed in {formatDateTime(s.createdAt)}
                {s.lastSeenAt && ` · last seen ${formatDateTime(s.lastSeenAt)}`}
              </Typography>
              <Button
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ path: `/users/${user._id}/sessions/${s._id}`, method: 'DELETE' })}
              >
                Revoke
              </Button>
            </Stack>
          ))}
          {sessions.data?.length === 0 && <Typography>No active sessions.</Typography>}
          <Typography variant="h6">API keys</Typography>
          {keys.data?.map((k) => (
            <Stack key={k._id} direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Typography>
                {k.name} {k.revokedAt ? '(revoked)' : ''}
              </Typography>
              <Button
                disabled={!!k.revokedAt || revoke.isPending}
                onClick={() => revoke.mutate({ path: `/users/${user._id}/keys/${k._id}`, method: 'DELETE' })}
              >
                Revoke
              </Button>
            </Stack>
          ))}
          <Button color="error" disabled={revoke.isPending} onClick={() => setConfirmRevokeAll(true)}>
            Revoke all sessions and credentials
          </Button>
          <ConfirmDialog
            open={confirmRevokeAll}
            title="Revoke every session and credential?"
            confirmLabel="Revoke all"
            busy={revoke.isPending}
            error={revoke.error?.message}
            onCancel={() => setConfirmRevokeAll(false)}
            onConfirm={() =>
              revoke.mutate(
                { path: `/users/${user._id}/revoke-sessions`, method: 'POST' },
                { onSuccess: () => setConfirmRevokeAll(false) }
              )
            }
          >
            {user.email} is signed out on every device, and every API key, OAuth connection and pending recovery link
            stops working. The account itself stays active.
          </ConfirmDialog>
          <Typography variant="h6">Group memberships</Typography>
          {groups.data?.map((g) => (
            <Typography key={g._id}>
              {g.name} · {g.members[0]?.role}
            </Typography>
          ))}
          <GroupManager userId={user._id} />
          <Typography variant="h6">Account change history</Typography>
          {detail.data?.history?.map((h, i) => (
            <Typography key={i} variant="body2">
              {formatDateTime(h.at)} · {h.reason} · {actorName(h.actorId)}
            </Typography>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
        <Button
          variant="contained"
          disabled={
            save.isPending ||
            !baseline ||
            !Object.keys(changes).length ||
            !reason.trim() ||
            (deactivating && confirmation !== user.email)
          }
          onClick={() => save.mutate()}
        >
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
function CreateUser({ close }: { close: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({ mutationFn: () => admin('/users', 'POST', { email, password }), onSuccess: close });
  return (
    <Dialog open onClose={close} fullWidth>
      <DialogTitle>Create password account</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>Provide the initial credential to the user through your established secure channel.</Typography>
          {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label="Initial password (10–200 characters)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          disabled={!email || password.length < 10 || password.length > 200 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Create account
        </Button>
      </DialogActions>
    </Dialog>
  );
}
