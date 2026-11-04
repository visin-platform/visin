import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Edit } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { resizeToAvatar } from '@visin/frontend-core';
import { assistantProfileApi, type ManagedAssistant } from '../../services/assistantProfileApi';

export function AssistantProfileEditor({
  assistantId,
  userId,
  viewerId,
  handle,
  bio,
  onSaved
}: {
  assistantId: string;
  userId: string;
  viewerId: string;
  handle: string;
  bio?: string;
  onSaved: (handle?: string) => Promise<unknown>;
}) {
  const managed = useQuery({
    queryKey: ['managed-assistants', viewerId],
    queryFn: () => assistantProfileApi.list(),
    retry: false
  });
  const assistant = managed.data?.find((item) => item._id === assistantId);
  const [editing, setEditing] = useState<ManagedAssistant>();
  const [name, setName] = useState('');
  const [newHandle, setHandle] = useState(handle);
  const [description, setDescription] = useState(bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError('');
    try {
      const savedHandle = await action();
      await onSaved(savedHandle || undefined);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!assistant) return null;
  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<Edit />}
        onClick={() => {
          setEditing(assistant);
          setName(assistant.name);
          setHandle(handle);
          setDescription(bio ?? '');
          setError('');
        }}
      >
        Edit profile
      </Button>
      <Dialog
        open={!!editing}
        onClose={() => {
          if (!busy) setEditing(undefined);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit assistant profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Assistant name"
              value={name}
              disabled={busy}
              required
              slotProps={{ htmlInput: { maxLength: 60 } }}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              label="Handle"
              value={newHandle}
              required
              disabled={busy}
              helperText="Changing the handle changes this profile’s URL."
              slotProps={{ htmlInput: { maxLength: 30 } }}
              onChange={(event) => setHandle(event.target.value)}
            />
            <TextField
              label="Description"
              value={description}
              multiline
              minRows={3}
              disabled={busy}
              slotProps={{ htmlInput: { maxLength: 280 } }}
              onChange={(event) => setDescription(event.target.value)}
            />
            <Button component="label" disabled={busy}>
              Upload or replace avatar
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                aria-label="Choose assistant avatar"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void run(async () => assistantProfileApi.upload(userId, await resizeToAvatar(file)));
                }}
              />
            </Button>
            <Button disabled={busy} onClick={() => void run(() => assistantProfileApi.remove(userId))}>
              Remove avatar
            </Button>
            <Typography variant="caption">Avatar changes save immediately. JPEG, PNG or WebP.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEditing(undefined)}>
            Close
          </Button>
          <Button
            disabled={busy || !name.trim() || !newHandle.trim()}
            variant="contained"
            onClick={() =>
              void run(async () => {
                if (!editing) return;
                const saved = await assistantProfileApi.saveProfile(assistantId, {
                  handle: newHandle.trim(),
                  bio: description,
                  public: true
                });
                await assistantProfileApi.rename(editing, name.trim());
                await managed.refetch();
                setEditing(undefined);
                return saved.handle;
              })
            }
          >
            Save profile
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
