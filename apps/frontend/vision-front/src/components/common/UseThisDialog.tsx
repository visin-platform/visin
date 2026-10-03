import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import CodeSnippet from '../project/CodeSnippet';
import type { Snippet } from '../../utils/useSnippets';

interface UseThisDialogProps {
  title: string;
  snippets: Snippet[];
  onClose: () => void;
}

/** Code to paste, pre-filled with the real ids and this deployment's addresses, so nobody retypes them. */
const UseThisDialog: React.FC<UseThisDialogProps> = ({ title, snippets, onClose }) => (
  <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="use-this-title">
    <DialogTitle id="use-this-title">{title}</DialogTitle>
    <DialogContent>
      <Stack spacing={2}>
        {snippets.map((snippet) => (
          <div key={snippet.title}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{snippet.title}</Typography>
            {snippet.note && <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{snippet.note}</Typography>}
            <CodeSnippet code={snippet.code} label={snippet.title} />
          </div>
        ))}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button variant="contained" onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

export default UseThisDialog;
