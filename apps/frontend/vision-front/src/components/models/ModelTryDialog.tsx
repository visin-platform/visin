import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import CodeSnippet from '../project/CodeSnippet';
import { modelService } from '../../services/modelService';
import type { ModelReference } from '../../types/training';
import { hubSpaceUrl, parseSpace } from '../../utils/hubLinks';
import { loadSnippet, predictSnippet, spaceSnippet } from '../../utils/modelSnippets';

interface ModelTryDialogProps {
  trainingId: string;
  model: ModelReference;
  onClose: () => void;
}

/**
 * How to run a model published to the Hub, pre-filled with its repo and commit.
 * Visin's own servers have no GPU and run no models, so this hands over what runs
 * elsewhere: on your machine, or in a demo Space that anyone with the link can use.
 * Once a Space exists, link it here and everyone who opens the run gets "Open demo".
 * The commands are for models trained with visin-fusion.
 */
const ModelTryDialog: React.FC<ModelTryDialogProps> = ({ trainingId, model, onClose }) => {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(model.space);
  const [draft, setDraft] = useState(model.space ?? '');
  const [touched, setTouched] = useState(false);
  const parsed = parseSpace(draft);

  const link = useMutation({
    mutationFn: (space: string | null) => modelService.setDemo(trainingId, model._id, space),
    onSuccess: (_models, space) => {
      setSaved(space ?? undefined);
      setDraft(space ?? '');
      queryClient.invalidateQueries({ queryKey: ['training', trainingId] });
      queryClient.invalidateQueries({ queryKey: ['model-registry'] });
    }
  });

  const save = () => {
    setTouched(true);
    if (parsed) link.mutate(parsed);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="model-try-title">
      <DialogTitle id="model-try-title">Try {model.repo}</DialogTitle>
      <DialogContent>
        {saved && (
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" component="a" href={hubSpaceUrl(saved)} target="_blank" rel="noopener noreferrer">
                Open demo
              </Button>
            }
          >
            A demo of this model is running at {saved}.
          </Alert>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Visin does not run models itself. These run the model at the exact commit this run produced, for models
          trained with <code>visin-fusion</code> (<code>pip install 'visin-fusion[hf]'</code>). A private repo needs your
          own <code>HF_TOKEN</code>.
        </Typography>
        <Stack spacing={2}>
          <div>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>In Python</Typography>
            <CodeSnippet code={loadSnippet(model)} label="Python snippet" />
          </div>
          <div>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>On a folder of images</Typography>
            <CodeSnippet code={predictSnippet(model)} label="predict command" />
          </div>
          <div>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>A demo anyone can open in a browser</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
              Creates a Hugging Face Space with an upload box and the predicted mask, with your own token. Add
              <code> --private</code> to keep it private.
            </Typography>
            <CodeSnippet code={spaceSnippet(model)} label="Space command" />
            <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Demo Space"
                placeholder="org/name or its address"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                error={draft.trim() !== '' ? !parsed : touched}
                helperText={draft.trim() !== '' && !parsed ? 'Expected a Space like "org/name"' : 'Once it exists, link it so everyone sees "Open demo".'}
                disabled={link.isPending}
                sx={{ flex: '1 1 260px' }}
              />
              <Button variant="outlined" onClick={save} disabled={link.isPending || parsed === saved} sx={{ mt: 0.25 }}>
                Link demo
              </Button>
              {saved && (
                <Button color="error" onClick={() => link.mutate(null)} disabled={link.isPending} sx={{ mt: 0.25 }}>
                  Unlink
                </Button>
              )}
            </Box>
            {link.isError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {link.error instanceof Error ? link.error.message : 'Could not link the demo'}
              </Alert>
            )}
            {saved && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                Visin does not check that the Space runs this model.{' '}
                <Link href={hubSpaceUrl(saved)} target="_blank" rel="noopener noreferrer">
                  {hubSpaceUrl(saved)}
                </Link>
              </Typography>
            )}
          </div>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModelTryDialog;
