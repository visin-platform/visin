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
import { Delete, Key, Visibility, Block } from '@mui/icons-material';
import { ConfirmDialog } from '../groups/GroupDialogs';
import { CreateApiKeyDialog, ShowTokenDialog } from '../apiKeys/ApiKeyDialogs';
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useRevealApiKey,
  useRevokeApiKey
} from '../../hooks/useApiKeys';
import { ApiKey, ApiKeyScope, SCOPE_DESCRIPTIONS, statusOf } from '../../types/apiKey';

type PendingConfirm = { kind: 'revoke' | 'delete'; key: ApiKey };

// Every call site already decides whether it has a date to show, so this does
// not carry a null case of its own.
const formatDate = (value: string): string => new Date(value).toLocaleDateString();

const STATUS_COLOR = {
  active: 'success',
  revoked: 'default',
  expired: 'warning'
} as const;

const ApiKeysTab: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [shown, setShown] = useState<{ token: string; isNew: boolean } | null>(null);

  const keys = useApiKeys();
  const createKey = useCreateApiKey();
  const revealKey = useRevealApiKey();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();

  const mutations = [createKey, revealKey, revokeKey, deleteKey];
  const busy = mutations.some(mutation => mutation.isPending);
  // auth-service answers with a specific message for each rejection — a 501
  // when the deployment has not enabled keys, a 404 for a key that is not
  // yours. Surface it rather than a generic failure.
  const mutationError = mutations.find(mutation => mutation.error)?.error;

  const create = (name: string, scopes: ApiKeyScope[], expiresInDays?: number) => {
    createKey.mutate(
      { name, scopes, expiresInDays },
      {
        onSuccess: created => {
          setCreateOpen(false);
          setShown({ token: created.token, isNew: true });
        }
      }
    );
  };

  const reveal = (key: ApiKey) => {
    revealKey.mutate(key.id, { onSuccess: token => setShown({ token, isNew: false }) });
  };

  const confirmCopy = (pending: PendingConfirm) =>
    pending.kind === 'revoke'
      ? {
          title: `Revoke ${pending.key.name}?`,
          message:
            'Anything using this key stops working immediately. The key stays in the list so you can see it existed.',
          confirmLabel: 'Revoke'
        }
      : {
          title: `Delete ${pending.key.name}?`,
          message: 'This cannot be undone. The record is removed entirely.',
          confirmLabel: 'Delete'
        };

  const runConfirmed = () => {
    if (!confirm) return;
    if (confirm.kind === 'revoke') revokeKey.mutate(confirm.key.id);
    if (confirm.kind === 'delete') deleteKey.mutate(confirm.key.id);
    setConfirm(null);
  };

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4, gap: 2 }}>
          <Box>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              API keys
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Keys let software act as you — an assistant connected over MCP, a script, a CI job. A
              key only reaches what you can already see, and only what you granted it.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Key />}
            onClick={() => setCreateOpen(true)}
            sx={{ borderRadius: 2, flexShrink: 0 }}
          >
            New key
          </Button>
        </Box>

        {mutationError && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {mutationError.message}
          </Alert>
        )}

        {keys.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : keys.error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {keys.error.message}
          </Alert>
        ) : keys.data && keys.data.length > 0 ? (
          <Stack spacing={2}>
            {keys.data.map(key => {
              const status = statusOf(key);
              return (
                <Paper
                  key={key.id}
                  variant="outlined"
                  sx={{ p: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {key.name}
                        </Typography>
                        <Chip size="small" label={status} color={STATUS_COLOR[status]} />
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', fontFamily: 'monospace', mb: 1 }}
                      >
                        {key.prefix}…
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                        {key.scopes.map(scope => (
                          <Tooltip key={scope} title={SCOPE_DESCRIPTIONS[scope]?.detail ?? scope}>
                            <Chip size="small" variant="outlined" label={scope} />
                          </Tooltip>
                        ))}
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Created {formatDate(key.createdAt)}
                        {' · '}
                        {/* The question people actually ask of this list is
                            "is anything still using this?" */}
                        {key.lastUsedAt ? `last used ${formatDate(key.lastUsedAt)}` : 'never used'}
                        {key.expiresAt ? ` · expires ${formatDate(key.expiresAt)}` : ''}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                      <Tooltip title="Show key">
                        <span>
                          <IconButton
                            size="small"
                            disabled={busy}
                            onClick={() => reveal(key)}
                            aria-label={`Show ${key.name}`}
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {status !== 'revoked' && (
                        <Tooltip title="Revoke key">
                          <span>
                            <IconButton
                              size="small"
                              disabled={busy}
                              onClick={() => setConfirm({ kind: 'revoke', key })}
                              aria-label={`Revoke ${key.name}`}
                            >
                              <Block fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete key">
                        <span>
                          <IconButton
                            size="small"
                            disabled={busy}
                            onClick={() => setConfirm({ kind: 'delete', key })}
                            aria-label={`Delete ${key.name}`}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        ) : (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              You have no API keys. Create one to connect an assistant to your training runs.
            </Typography>
          </Box>
        )}
      </Paper>

      <CreateApiKeyDialog
        open={createOpen}
        busy={createKey.isPending}
        onClose={() => setCreateOpen(false)}
        onCreate={create}
      />

      <ShowTokenDialog
        open={shown !== null}
        token={shown?.token ?? ''}
        isNew={shown?.isNew ?? false}
        onClose={() => setShown(null)}
      />

      {confirm && (
        <ConfirmDialog
          open
          {...confirmCopy(confirm)}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      )}
    </Box>
  );
};

export default ApiKeysTab;
