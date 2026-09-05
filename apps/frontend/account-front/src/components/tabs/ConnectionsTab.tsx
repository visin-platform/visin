import React, { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { LinkOff } from '@mui/icons-material';
import { ConfirmDialog } from '../groups/GroupDialogs';
import { useConnections, useRevokeConnection } from '../../hooks/useConnections';
import { SCOPE_DESCRIPTIONS } from '../../types/apiKey';
import { Connection } from '../../types/connection';

const formatDate = (value: string): string => new Date(value).toLocaleDateString();

const ConnectionsTab: React.FC = () => {
  const [confirm, setConfirm] = useState<Connection | null>(null);

  const connections = useConnections();
  const revoke = useRevokeConnection();

  // Revoked grants stay in the list on the server so the history is visible,
  // but this page answers "what can reach my account right now" — a disconnected
  // app in the list only invites someone to disconnect it again.
  const active = connections.data?.filter(connection => !connection.revokedAt) ?? [];

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Connected apps
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Assistants you have connected to Visin. Each one can reach only what you could already
            see, and only the permissions you approved when you connected it.
          </Typography>
        </Box>

        {revoke.error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {revoke.error.message}
          </Alert>
        )}

        {connections.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : connections.error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {connections.error.message}
          </Alert>
        ) : active.length > 0 ? (
          <Stack spacing={2}>
            {active.map(connection => (
              <Paper
                key={connection.id}
                variant="outlined"
                sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                      {connection.clientName}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                      {connection.scopes.map(scope => (
                        <Tooltip key={scope} title={SCOPE_DESCRIPTIONS[scope]?.detail ?? scope}>
                          <Chip size="small" variant="outlined" label={scope} />
                        </Tooltip>
                      ))}
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Connected {formatDate(connection.createdAt)}
                      {connection.lastRenewedAt
                        ? ` · last active ${formatDate(connection.lastRenewedAt)}`
                        : ''}
                    </Typography>
                  </Box>

                  <Tooltip title="Disconnect">
                    <span>
                      <IconButton
                        size="small"
                        disabled={revoke.isPending}
                        onClick={() => setConfirm(connection)}
                        aria-label={`Disconnect ${connection.clientName}`}
                      >
                        <LinkOff fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No apps are connected. An assistant that supports MCP can connect at
              {' '}
              <code>https://mcp.visin.eu/mcp</code>.
            </Typography>
          </Box>
        )}
      </Paper>

      {confirm && (
        <ConfirmDialog
          open
          title={`Disconnect ${confirm.clientName}?`}
          // Said plainly rather than implying the cut is instant: access tokens
          // are stateless and unrevokable, so one already issued keeps working
          // until it expires. Revoking stops it getting another.
          message="It will not be able to renew its access. Anything it is holding right now keeps working for up to an hour."
          confirmLabel="Disconnect"
          busy={revoke.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            revoke.mutate(confirm.clientId);
            setConfirm(null);
          }}
        />
      )}
    </Box>
  );
};

export default ConnectionsTab;
