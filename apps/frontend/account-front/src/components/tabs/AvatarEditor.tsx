import React, { useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Typography, useTheme } from '@mui/material';
import { Delete, PhotoCamera } from '@mui/icons-material';
import { ApiError, livePalette } from '@visin/frontend-core';
import { AvatarError, resizeToAvatar } from '../../utils/resizeImage';

interface AvatarEditorProps {
  picture?: string;
  /** What stands in for it: the first letter of the name. */
  initial: React.ReactNode;
  /** Sends the shrunk picture; resolves to the address the server now serves it from. */
  upload: (image: Blob) => Promise<string>;
  /** Removes the picture. */
  remove: () => Promise<void>;
  /** The picture as the server now has it; undefined once removed. */
  onChange?: (picture: string | undefined) => void;
}

/**
 * The account's picture and the way to change it. A choice is shrunk to a square in the browser and sent at once:
 * it is not one of the fields Save Changes holds back.
 */
const AvatarEditor: React.FC<AvatarEditorProps> = ({ picture, initial, upload, remove, onChange }) => {
  const theme = useTheme();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      if (failure instanceof AvatarError) setError(failure.message);
      else if (
        failure instanceof ApiError &&
        (failure.status === 400 || failure.status === 413 || failure.status === 501)
      ) {
        setError(failure.message);
      } else setError('Could not update the picture. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // So choosing the same file again still counts as a choice.
    event.target.value = '';
    if (!file) return;
    void run(async () => {
      // Not `onChange?.(await upload(…))`: with no `onChange`, that never evaluates its argument, so nothing is sent.
      const picture = await upload(await resizeToAvatar(file));
      onChange?.(picture);
    });
  };

  const removePicture = () =>
    run(async () => {
      await remove();
      onChange?.(undefined);
    });

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Avatar
        src={picture}
        alt=""
        slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
        sx={{
          width: 80,
          height: 80,
          fontSize: '2rem',
          fontWeight: 700,
          bgcolor: theme.alpha(livePalette(theme).primary.main, 0.12),
          color: 'primary.main'
        }}
      >
        {initial}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PhotoCamera />}
            onClick={() => input.current?.click()}
          >
            {picture ? 'Change picture' : 'Upload picture'}
          </Button>
          {picture && (
            <Button
              size="small"
              color="inherit"
              disabled={busy}
              startIcon={<Delete />}
              onClick={() => void removePicture()}
              sx={{ color: 'text.secondary' }}
            >
              Remove
            </Button>
          )}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.75 }}>
          Shown on your public page and beside what you own. It is cropped to a square from the middle.
        </Typography>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose a picture"
          data-testid="picture-input"
          onChange={choose}
        />
      </Box>
      {error && (
        <Alert severity="error" sx={{ width: '100%' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default AvatarEditor;
