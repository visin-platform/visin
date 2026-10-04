import React from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import type { ProjectStorage } from '../../types/Project';
import type { StorageProvider } from '../../types/providers';
import { storageChoices, storageProviders, switchProvider, withSetting } from './storageProviders';

/**
 * Where this project keeps its big files.
 *
 * `visin` is the default and keeps everything on this deployment: the choice for
 * restricted datasets, images of people or institutes that need data to stay on
 * their own servers. Another store (Hugging Face, say) lets runs link models and train on its datasets; Visin
 * stores only a pointer, so the checkpoint itself is uploaded where it was trained, with the uploader's own token.
 * What each provider is called and keeps is in `storageProviders.ts`.
 */

interface StorageEditorProps {
  value: ProjectStorage;
  onChange: (storage: ProjectStorage) => void;
  disabled?: boolean;
}

export const StorageEditor: React.FC<StorageEditorProps> = ({ value, onChange, disabled }) => {
  const settings = storageProviders[value.provider].settings ?? [];
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          select
          size="small"
          label="Storage"
          value={value.provider}
          onChange={event => onChange(switchProvider(event.target.value as StorageProvider, value))}
          disabled={disabled}
          sx={{ flex: '1 1 200px' }}
        >
          {storageChoices.map(({ provider, view }) => (
            <MenuItem key={provider} value={provider}>{view.label}</MenuItem>
          ))}
        </TextField>
        {settings.map(setting => (
          <TextField
            key={setting.key}
            size="small"
            label={setting.label}
            value={value.settings?.[setting.key] ?? ''}
            onChange={event => onChange(withSetting(value, setting.key, event.target.value))}
            disabled={disabled}
            placeholder={setting.placeholder}
            helperText={setting.helperText}
            sx={{ flex: '1 1 240px' }}
          />
        ))}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
        {storageProviders[value.provider].summary}
      </Typography>
    </Box>
  );
};

export default StorageEditor;
