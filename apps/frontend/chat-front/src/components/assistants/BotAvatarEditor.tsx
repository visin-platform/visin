import { useRef, useState } from 'react';
import { Alert, Avatar, Button, Stack, Typography } from '@mui/material';
import { resizeToAvatar } from '@visin/frontend-core';
import { botPictureService } from '../../services/botPictureService';

export function BotAvatarEditor({
  userId,
  name,
  picture,
  onChange
}: {
  userId: string;
  name: string;
  picture?: string;
  onChange: (picture?: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={1}>
      <Avatar
        src={picture ? botPictureService.previewUrl(userId, picture) : undefined}
        alt={`${name} avatar`}
        sx={{ width: 80, height: 80 }}
      >
        {name.charAt(0)}
      </Avatar>
      <Stack direction="row" spacing={1}>
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {picture ? 'Replace bot avatar' : 'Upload bot avatar'}
        </Button>
        {picture && (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await botPictureService.remove(userId);
                onChange(undefined);
              })
            }
          >
            Remove bot avatar
          </Button>
        )}
      </Stack>
      <Typography variant="caption">
        JPEG, PNG or WebP. Cropped to a square from the center and resized before uploading. Changes save immediately.
      </Typography>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        aria-label="Choose bot avatar"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file)
            void run(async () => {
              onChange(await botPictureService.upload(userId, await resizeToAvatar(file)));
            });
        }}
      />
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
