import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { Computer, Logout, Smartphone } from '@mui/icons-material';
import { ConfirmDialog } from '../groups/GroupDialogs';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '../../hooks/useSessions';
import { Session, SignInMethod } from '../../types/session';

const METHOD_LABELS: Record<SignInMethod, string | null> = {
  password: 'Signed in with password',
  google: 'Signed in with Google',
  unknown: null
};

const MOBILE = /Android|iPhone|iPad/;

const formatDate = (value: string): string => new Date(value).toLocaleDateString();

/** "Active now" within the server's few-minute renewal grain, otherwise relative. */
const formatLastActive = (value: string, now = Date.now()): string => {
  const minutes = Math.round((now - new Date(value).getTime()) / 60_000);
  if (minutes < 10) return 'Active now';
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 60) return `Active ${relative.format(-minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Active ${relative.format(-hours, 'hour')}`;
  return `Active ${relative.format(-Math.round(hours / 24), 'day')}`;
};

/**
 * Every browser signed in to the account, with a way to sign any other one out
 * — a lost phone, a shared computer. Signing out ends the session on the server
 * at once, not just on the device. The current device has no button here:
 * signing it out is what the menu's sign-out does.
 */
const SessionsCard: React.FC = () => {
  const [confirm, setConfirm] = useState<Session | 'others' | null>(null);

  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const list = sessions.data ?? [];
  const others = list.filter(session => !session.current);
  const busy = revoke.isPending || revokeOthers.isPending;
  const error = revoke.error ?? revokeOthers.error;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, borderColor: 'divider' }}>
      <Box
        sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}
      >
        <Box>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Where you're signed in
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Signing a device out ends its session straight away. A device you have not used for 30 days is
            signed out on its own.
          </Typography>
        </Box>
        {others.length > 0 && (
          <Button variant="outlined" color="error" disabled={busy} onClick={() => setConfirm('others')}>
            Sign out all other devices
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error.message}
        </Alert>
      )}

      {sessions.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : sessions.error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {sessions.error.message}
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          {list.map(session => {
            const method = METHOD_LABELS[session.method];
            return (
              <Box
                key={session.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ color: 'text.secondary', display: 'flex' }} aria-hidden>
                  {MOBILE.test(session.device) ? <Smartphone /> : <Computer />}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {session.device}
                    </Typography>
                    {session.current && <Chip size="small" color="primary" label="This device" />}
                  </Box>
                  <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                    {session.current ? 'Active now' : formatLastActive(session.lastSeenAt)}
                    {' · '}
                    {method ? `${method} ${formatDate(session.createdAt)}` : `Since ${formatDate(session.createdAt)}`}
                  </Typography>
                </Box>
                {!session.current && (
                  <Tooltip title="Sign out">
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() => setConfirm(session)}
                        aria-label={`Sign out ${session.device}`}
                      >
                        <Logout fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={confirm === 'others' ? 'Sign out all other devices?' : `Sign out ${confirm.device}?`}
          message={
            confirm === 'others'
              ? `Every device except this one (${others.length}) will need to sign in again.`
              : 'It will need to sign in again. Anything open there stops working on its next request.'
          }
          confirmLabel="Sign out"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'others') revokeOthers.mutate();
            else revoke.mutate(confirm.id);
            setConfirm(null);
          }}
        />
      )}
    </Paper>
  );
};

export default SessionsCard;
