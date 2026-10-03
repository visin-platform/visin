import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import type { DatasetSource } from '../../services/datasetService';

interface HubSourceDialogProps {
  open: boolean;
  current?: DatasetSource;
  /** the dataset's id, for the `visin push` command shown when there is a zip to publish */
  datasetId?: string;
  /** whether a zip is kept on Visin, which the dataset falls back to when the source is cleared */
  hasZip: boolean;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  /** null clears the source */
  onSave: (source: Pick<DatasetSource, 'repo' | 'revision'> | null) => void;
}

const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
const COMMIT = /^[0-9a-fA-F]{40}$/;

/**
 * Point the dataset at a Hugging Face Hub repo. Visin keeps the pointer, not the
 * files, and pins it to one commit so a run from last year still names the same
 * data. A zip kept on Visin stays as the fallback for machines without Hub access.
 */
const HubSourceDialog: React.FC<HubSourceDialogProps> = ({ open, current, datasetId, hasZip, busy, error, onCancel, onSave }) => {
  const [repo, setRepo] = useState('');
  const [revision, setRevision] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setRepo(current?.repo ?? '');
      setRevision(current?.revision ?? '');
      setTouched(false);
    }
  }, [open, current]);

  const repoError = repo.trim() !== '' && !REPO.test(repo.trim()) ? 'Expected a repo id like "org/name"' : '';
  const revisionError = revision.trim() !== '' && !COMMIT.test(revision.trim())
    ? 'Paste the full 40-character commit hash, not a branch or tag'
    : '';
  const valid = REPO.test(repo.trim()) && COMMIT.test(revision.trim());

  const save = () => {
    setTouched(true);
    if (valid) onSave({ repo: repo.trim(), revision: revision.trim().toLowerCase() });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Hugging Face source</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Keep this dataset on the Hugging Face Hub. Visin stores only the repo and the commit; training machines
          download it from the Hub.{hasZip ? ' The zip kept on Visin stays as a fallback.' : ''}
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Dataset repo"
            placeholder="org/name"
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            error={Boolean(repoError) || (touched && !REPO.test(repo.trim()))}
            helperText={repoError || undefined}
            disabled={busy}
            size="small"
            autoFocus
          />
          <TextField
            label="Commit"
            placeholder="40-character commit hash"
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            error={Boolean(revisionError) || (touched && !COMMIT.test(revision.trim()))}
            helperText={revisionError || 'The exact version trainings will use. A branch name can move; a commit cannot.'}
            disabled={busy}
            size="small"
          />
        </Stack>
        {hasZip && !current && datasetId && (
          <Alert severity="info" sx={{ mt: 2 }}>
            To publish this dataset's zip to a new Hub repo, run this on your own machine. It uses your Hub token, which
            Visin never sees, then sets the source here for you:
            <Box component="pre" sx={{ m: 0, mt: 1, overflowX: 'auto', fontSize: '0.8rem' }}>
              {`pip install 'visin[hf]'\nvisin push ${datasetId} --repo org/name`}
            </Box>
            Only publish data whose licence allows redistribution, and nothing with images of people unless they agreed.
            A new repo is private unless you add <code>--public</code>.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        {current && (
          <Button color="error" onClick={() => onSave(null)} disabled={busy} sx={{ mr: 'auto' }}>
            {hasZip ? 'Use the zip instead' : 'Remove source'}
          </Button>
        )}
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HubSourceDialog;
