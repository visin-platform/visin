import { BotAvatarEditor } from './BotAvatarEditor';
import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { assistantService } from '../../services/assistantService';

export function AssistantProfileForm({
  assistantId,
  name,
  onClose
}: {
  assistantId: string;
  name: string;
  onClose: () => void;
}) {
  const [identity, setIdentity] = useState<{ userId?: string; picture?: string }>({});
  const [profile, setProfile] = useState({ handle: '', bio: '', public: false });
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void assistantService
      .profile(assistantId, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (value) {
          setProfile({ handle: value.handle, bio: value.bio, public: value.public });
          setIdentity({ userId: value.userId, picture: value.picture });
        }
        setReady(true);
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [assistantId]);
  return (
    <Stack
      component="form"
      spacing={1}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setSaved(false);
        try {
          const value = await assistantService.saveProfile(assistantId, profile);
          setProfile({ handle: value.handle, bio: value.bio, public: value.public });
          setIdentity({ userId: value.userId, picture: value.picture });
          setSaved(true);
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Typography sx={{ fontWeight: 600 }}>{name} public profile</Typography>
      <Typography variant="body2">
        Published bots appear in People. Anyone signed in can ask them or add them to a chat under its assistant policy.
        Instructions are disclosed when added to shared chats. Private chats and project access stay with the person
        asking.
      </Typography>
      {saved && <Alert severity="success">Profile saved. You can upload or change the avatar below.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {identity.userId ? (
        <BotAvatarEditor
          userId={identity.userId}
          name={name}
          picture={identity.picture}
          onChange={(picture) => setIdentity({ ...identity, picture })}
        />
      ) : (
        <Typography variant="caption">Save the bot profile to enable avatar uploads here.</Typography>
      )}
      <TextField
        label="Bot handle"
        required
        disabled={!ready || saving}
        value={profile.handle}
        onChange={(e) => setProfile({ ...profile, handle: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 30 } }}
      />
      <TextField
        label="Public bio"
        multiline
        disabled={!ready || saving}
        value={profile.bio}
        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 280 } }}
      />
      <FormControlLabel
        label="Public profile and available to others"
        control={
          <Checkbox
            disabled={!ready || saving}
            checked={profile.public}
            onChange={(e) => setProfile({ ...profile, public: e.target.checked })}
          />
        }
      />
      <Button type="submit" disabled={!ready || saving || !profile.handle.trim()}>
        Save public profile
      </Button>
      <Button disabled={saving} onClick={onClose}>
        Close profile editor
      </Button>
      {profile.public && <Typography variant="body2">Profile: /u/{profile.handle}</Typography>}
    </Stack>
  );
}
