import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { groupService } from '../services/groupService';

const STORAGE_KEY = 'visin-group-invitation';

export default function GroupInvitationPage() {
  const { user, isAuthenticated, isLoading, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token] = useState(() => location.hash.slice(1) || sessionStorage.getItem(STORAGE_KEY) || '');
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
    }
  });
  if (isLoading) return <CircularProgress />;
  if (!valid) return <Alert severity="error">This invitation link is invalid.</Alert>;
  if (!isAuthenticated)
    return (
      <Box>
        <Typography>Sign in to review this group invitation.</Typography>
        <Button onClick={login}>Sign in</Button>
      </Box>
    );
  const error = preview.error || accept.error;
  return (
    <Box sx={{ p: 4 }}>
      {preview.isPending && <CircularProgress />}
      {error && <Alert severity="error">{error.message}</Alert>}
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
