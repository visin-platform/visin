import React from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import type { ProjectStorage } from '../../types/Project';

/**
 * Where this project keeps its big files.
 *
 * `visin` is the default and keeps everything on this deployment: the choice for
 * restricted datasets, images of people or institutes that need data to stay on
 * their own servers. `hf` lets runs link models and train on datasets on the Hugging Face Hub; Visin
 * stores only a pointer, so the checkpoint itself is uploaded where it was
 * trained, with the uploader's own Hub token.
 */

interface StorageEditorProps {
  value: ProjectStorage;
  onChange: (storage: ProjectStorage) => void;
  disabled?: boolean;
}

export const StorageEditor: React.FC<StorageEditorProps> = ({ value, onChange, disabled }) => (
  <Box>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
      <TextField
        select
        size="small"
        label="Storage"
        value={value.provider}
        // Leaving the Hub forgets its namespace: it means nothing on a Visin project.
        onChange={event => onChange(event.target.value === 'hf'
          ? { provider: 'hf', ...(value.hfNamespace ? { hfNamespace: value.hfNamespace } : {}) }
          : { provider: 'visin' })}
        disabled={disabled}
        sx={{ flex: '1 1 200px' }}
      >
        <MenuItem value="visin">Visin (this server only)</MenuItem>
        <MenuItem value="hf">Hugging Face Hub</MenuItem>
      </TextField>
      {value.provider === 'hf' && (
        <TextField
          size="small"
          label="Hub user or organisation"
          value={value.hfNamespace ?? ''}
          onChange={event => {
            const hfNamespace = event.target.value.trim();
            onChange({ provider: 'hf', ...(hfNamespace ? { hfNamespace } : {}) });
          }}
          disabled={disabled}
          placeholder="acme"
          helperText="Optional. Where a pipeline creates model repos by default."
          sx={{ flex: '1 1 240px' }}
        />
      )}
    </Box>
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
      {value.provider === 'hf'
        ? 'Runs can link models and use datasets on the Hub. Visin keeps only a pointer to the exact commit; the checkpoint is uploaded from the training machine with your own Hub token.'
        : 'Nothing leaves this server, and runs that link Hub models or use Hub datasets are refused.'}
    </Typography>
  </Box>
);

export default StorageEditor;
