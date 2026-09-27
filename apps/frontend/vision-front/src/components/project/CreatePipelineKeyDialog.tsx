import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeyService } from '../../services/apiKeyService';
import { pipelineEnv } from '../../utils/pipelineEnv';

/** Never expiring is a real choice, so it is an option rather than the absence of one. */
const EXPIRY_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: 'A year' }
];

interface CreatePipelineKeyDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** The new key, the one moment it is known in full: a caller can put it into its own snippets. */
  onCreated?: (token: string) => void;
}

/**
 * Make a pipeline key for this project: a name and an expiry, nothing else.
 * Its scopes are fixed to what a training script needs, and the lines the
 * script reads are shown once, ready to copy.
 */
const CreatePipelineKeyDialog: React.FC<CreatePipelineKeyDialogProps> = ({ projectId, open, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(0);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => apiKeyService.createPipelineKey(projectId, name.trim(), expiresInDays || undefined),
    onSuccess: ({ token }) => {
      setCreated(token);
      onCreated?.(token);
      queryClient.invalidateQueries({ queryKey: ['pipeline-keys', projectId] });
    }
  });

  const close = () => {
    setCreated(null);
    setCopied(false);
    setName('');
    setExpiresInDays(0);
    create.reset();
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pipelineEnv(created ?? ''));
      setCopied(true);
    } catch {
      // A denied clipboard is not worth an error state: the lines are on screen and selectable.
    }
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{created ? 'Your new pipeline key' : 'New pipeline key'}</DialogTitle>
      <DialogContent>
        {!created ? (
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              autoFocus
              label="What is it for?"
              placeholder="nightly training"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={create.isPending}
            />
            <TextField
              select
              label="Expires"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
              disabled={create.isPending}
              sx={{ maxWidth: 200 }}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            {create.isError && <Alert severity="error">{create.error.message}</Alert>}
          </Box>
        ) : (
          <Box sx={{ pt: 1 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              Copy this now. You can read it back later under Account → API keys.
            </Alert>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Set these where your training script runs:
            </Typography>
            <Paper
              variant="outlined"
              sx={{ p: 2, bgcolor: 'background.default', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}
            >
              <Typography component="pre" variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap', m: 0 }}>
                {pipelineEnv(created)}
              </Typography>
              <IconButton onClick={copy} aria-label="Copy key">
                <ContentCopyIcon />
              </IconButton>
            </Paper>
            {copied && (
              <Typography variant="caption" sx={{ color: 'success.main', mt: 1, display: 'block' }}>
                Copied to clipboard.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {!created ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              Create key
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={close}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CreatePipelineKeyDialog;
