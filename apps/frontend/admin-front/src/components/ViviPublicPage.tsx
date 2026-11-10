import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Link,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { Panel } from '@visin/frontend-core';
import { useConfig } from '../config/ConfigProvider';
import { admin } from '../services/admin';

interface PublicProfile {
  assistantId: string;
  name: string;
  handle: string;
  bio: string;
  public: boolean;
}
const PATH = '/vivi/admin/profile';
const KEY = ['vivi-public-profile'];
const HANDLE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,28}[a-z0-9]$/;

/** The existing /u/:handle page, configured through Vivi's platform-admin profile API. */
export default function ViviPublicPage() {
  const profile = useQuery({
    queryKey: KEY,
    queryFn: () => admin<PublicProfile>(PATH),
    retry: false,
    refetchOnWindowFocus: false
  });
  return (
    <Panel aria-label="Vivi public page">
      <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" component="h2">
          Public page
        </Typography>
        <Typography>Choose Vivi’s public address and whether visitors can open the page.</Typography>
        {profile.isPending ? (
          <CircularProgress aria-label="Loading Vivi public page" />
        ) : profile.isError ? (
          <>
            <Alert severity="warning">{profile.error.message}</Alert>
            <Button onClick={() => void profile.refetch()}>Retry public page</Button>
          </>
        ) : (
          <Editor key={profile.data.assistantId} profile={profile.data} />
        )}
      </Stack>
    </Panel>
  );
}

function Editor({ profile }: { profile: PublicProfile }) {
  const config = useConfig();
  const cache = useQueryClient();
  const [draft, setDraft] = useState(() => ({
    name: profile.name,
    handle: profile.handle,
    bio: profile.bio,
    public: profile.public
  }));
  const handle = draft.handle.trim().toLowerCase();
  const name = draft.name.trim();
  const valid = HANDLE.test(handle) && name.length > 0 && name.length <= 60 && draft.bio.length <= 280;
  const changed =
    name !== profile.name || handle !== profile.handle || draft.bio !== profile.bio || draft.public !== profile.public;
  const root = config.SHELL_FRONT_URL?.replace(/\/$/, '');
  const preview = `${root || ''}/u/${handle}`;
  const savedLink = root && profile.public && profile.handle ? `${root}/u/${encodeURIComponent(profile.handle)}` : null;
  const save = useMutation({
    mutationFn: () => admin<PublicProfile>(PATH, 'PUT', { ...draft, name, handle }),
    onSuccess: (saved) => {
      cache.setQueryData(KEY, saved);
      setDraft({ name: saved.name, handle: saved.handle, bio: saved.bio, public: saved.public });
    }
  });
  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && changed && !save.isPending) save.mutate();
      }}
    >
      <TextField
        label="Display name"
        value={draft.name}
        disabled={save.isPending}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        slotProps={{ htmlInput: { maxLength: 60 } }}
      />
      <TextField
        label="Page address"
        value={draft.handle}
        disabled={save.isPending}
        onChange={(event) => setDraft({ ...draft, handle: event.target.value })}
        error={Boolean(handle) && !HANDLE.test(handle)}
        helperText="3–30 letters, numbers or single hyphens. Changing this address changes links to Vivi."
        slotProps={{
          input: { startAdornment: <InputAdornment position="start">/u/</InputAdornment> },
          htmlInput: { maxLength: 30 }
        }}
      />
      {HANDLE.test(handle) && <Typography variant="body2">Address after saving: {preview}</Typography>}
      <TextField
        label="About Vivi"
        multiline
        minRows={2}
        value={draft.bio}
        disabled={save.isPending}
        onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
        slotProps={{ htmlInput: { maxLength: 280 } }}
      />
      <FormControlLabel
        label="Public page visible"
        control={
          <Switch
            checked={draft.public}
            disabled={save.isPending}
            onChange={(event) => setDraft({ ...draft, public: event.target.checked })}
          />
        }
      />
      {!draft.public && (
        <Typography variant="body2">Visitors cannot open the public page while it is hidden.</Typography>
      )}
      {save.isError && <Alert severity="error">{save.error.message}</Alert>}
      {save.isSuccess && !changed && <Alert severity="success">Vivi’s public page was saved.</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Button type="submit" variant="contained" disabled={!changed || !valid || save.isPending}>
          Save public page
        </Button>
        {savedLink && (
          <Link href={savedLink} target="_blank" rel="noopener noreferrer">
            Open public page
          </Link>
        )}
      </Stack>
    </Stack>
  );
}
