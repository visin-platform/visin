import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { modelService } from '../../services/modelService';
import type { ModelReference } from '../../types/training';

interface ModelCardDialogProps {
  trainingId: string;
  model: ModelReference;
  onClose: () => void;
}

/**
 * The README Visin writes for a linked model, for the case where the card on the
 * Hub is missing or stale. Visin holds no Hub token, so it cannot publish it:
 * copy it, or download it, and put it in the repo.
 */
const ModelCardDialog: React.FC<ModelCardDialogProps> = ({ trainingId, model, onClose }) => {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['model-card', trainingId, model.repo, model.epoch],
    queryFn: () => modelService.card(trainingId, { repo: model.repo, epoch: model.epoch })
  });

  const copy = async () => {
    await navigator.clipboard.writeText(data ?? '');
    setCopied(true);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([data ?? ''], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'README.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="model-card-title">
      <DialogTitle id="model-card-title">Model card for {model.repo}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Written from what this run recorded. Add it to the repo as README.md; Visin holds no Hugging Face token, so
          it cannot do that for you. <code>run.log_model</code> adds it by itself when the repo has no README.
        </Typography>
        {isLoading && <CircularProgress />}
        {isError && <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load the model card'}</Alert>}
        {data && (
          <Box
            component="pre"
            tabIndex={0}
            aria-label="Model card"
            sx={{ m: 0, p: 2, maxHeight: '50vh', overflow: 'auto', fontSize: '0.8rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          >
            {data}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={copy} disabled={!data}>{copied ? 'Copied' : 'Copy'}</Button>
        <Button onClick={download} disabled={!data}>Download README.md</Button>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModelCardDialog;
