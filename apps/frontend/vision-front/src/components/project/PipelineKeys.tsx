import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiKeyService, type ApiKey } from '../../services/apiKeyService';
import CreatePipelineKeyDialog from './CreatePipelineKeyDialog';
import { formatDateTime } from '../../utils';

const statusOf = (key: ApiKey): 'Active' | 'Revoked' | 'Expired' => {
  if (key.revokedAt) return 'Revoked';
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) return 'Expired';
  return 'Active';
};

interface PipelineKeysProps {
  projectId: string;
}

/**
 * The keys a training pipeline sends this project's runs and results with.
 *
 * A pipeline key is an ordinary API key limited to this project, with only the
 * two scopes a script needs. It acts as whoever made it, so someone who loses
 * access to the project loses their keys' access with it. Account → API keys
 * lists every key; this shows the caller's own keys for this project.
 */
const PipelineKeys: React.FC<PipelineKeysProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const queryKey = ['pipeline-keys', projectId];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);

  const keys = useQuery({ queryKey, queryFn: () => apiKeyService.listForProject(projectId) });

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeyService.revoke(id),
    onSuccess: () => {
      setToRevoke(null);
      queryClient.invalidateQueries({ queryKey });
    }
  });

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">Pipeline keys</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            New pipeline key
          </Button>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          A pipeline key lets a training script send runs and results to this project, and nothing else. It acts as
          you: if you lose access to the project, the key stops working here. All your keys are under Account → API
          keys.
        </Typography>
        {keys.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Could not load your keys: {keys.error.message}
          </Alert>
        )}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Key</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last used</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {(keys.data ?? []).map((key) => {
                const status = statusOf(key);
                return (
                  <TableRow key={key.id}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell>
                      <Chip label={`${key.prefix}…`} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                    </TableCell>
                    <TableCell>{formatDateTime(key.createdAt)}</TableCell>
                    <TableCell>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never'}</TableCell>
                    <TableCell>
                      <Chip label={status} color={status === 'Active' ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      {status === 'Active' && (
                        <Tooltip title="Revoke key">
                          <IconButton color="error" size="small" aria-label={`Revoke ${key.name}`} onClick={() => setToRevoke(key)}>
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {keys.isSuccess && keys.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography sx={{ color: 'text.secondary' }}>You have no pipeline keys for this project yet</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      <CreatePipelineKeyDialog projectId={projectId} open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <Dialog open={Boolean(toRevoke)} onClose={() => setToRevoke(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Revoke pipeline key</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Anything still using “{toRevoke?.name}” stops being able to send results here.
          </Typography>
          {revoke.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {revoke.error.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToRevoke(null)} disabled={revoke.isPending}>
            Cancel
          </Button>
          <Button color="error" variant="contained" disabled={revoke.isPending} onClick={() => toRevoke && revoke.mutate(toRevoke.id)}>
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default PipelineKeys;
