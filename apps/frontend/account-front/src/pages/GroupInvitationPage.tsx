import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ApiError } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
import { groupService } from '../services/groupService';
import { tokenFromHash } from '../utils/invitationToken';

const STORAGE_KEY = 'visin-group-invitation';

const alreadyMember = (error: unknown): boolean => error instanceof ApiError && error.status === 409 && /already a member/i.test(error.message);

export default function GroupInvitationPage() {
  const { user, isAuthenticated, isLoading, login, signup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token] = useState(() => tokenFromHash(location.hash) || sessionStorage.getItem(STORAGE_KEY) || '');
  const valid = /^[0-9a-f]{64}$/.test(token);
  useEffect(() => {
    if (valid) sessionStorage.setItem(STORAGE_KEY, token);
    // Keep the invite out of the sign-in redirect URL and HTTP request logs.
    if (location.hash) navigate('/invite', { replace: true });
  }, [token, valid, location.hash, navigate]);
  const preview = useQuery({
    queryKey: ['group-invitation', user?.id, token],
    queryFn: () => groupService.previewInvitation(token),
    enabled: isAuthenticated && valid,
    retry: false,
    gcTime: 0
  });
  const accept = useMutation({
    mutationFn: () => groupService.acceptInvitation(token),
    onSuccess: () => {
      sessionStorage.removeItem(STORAGE_KEY);
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      navigate('/account/groups', { replace: true });
    },
    // Nothing left to accept: the link is spent for this account either way.
    onError: (error) => {
      if (alreadyMember(error)) sessionStorage.removeItem(STORAGE_KEY);
    }
  });
  if (isLoading) return <CircularProgress />;
  if (!valid)
    return (
      <Alert severity="error">
        This invitation link is incomplete or invalid. Open the whole link, including the part after “#”, or ask the
        person who invited you to send a new one — or to add you by name under Add member, which needs no link.
      </Alert>
    );
  if (!isAuthenticated)
    return (
      <Box>
        <Typography variant="h5">You are invited to a group</Typography>
        <Typography sx={{ my: 2 }}>
          You are not signed in to Visin in this browser. Sign in with the account that should join the group, or
          create one; you come back here to accept.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={login}>
            Sign in
          </Button>
          <Button onClick={signup}>Create account</Button>
        </Stack>
      </Box>
    );
  if (alreadyMember(accept.error))
    return (
      <Alert severity="info">
        You are already a member of {preview.data?.name ?? 'this group'}.{' '}
        <RouterLink to="/account/groups">Go to your groups</RouterLink>
      </Alert>
    );
  const error = preview.error || accept.error;
  return (
    <Box sx={{ p: 4 }}>
      {preview.isPending && <CircularProgress />}
      {error && (
        <Alert severity="error">
          {error.message}
          {preview.error && ' Ask the person who invited you for a new link, or to add you by name under Add member.'}
        </Alert>
      )}
      {preview.data && (
        <>
          <Typography variant="h5">Join {preview.data.name}</Typography>
          <Typography sx={{ my: 2 }}>
            Join as {preview.data.role} using {user?.email || user?.id}.
          </Typography>
          <Button variant="contained" disabled={accept.isPending || preview.isError} onClick={() => accept.mutate()}>
            Accept invitation
          </Button>
        </>
      )}
    </Box>
  );
}
