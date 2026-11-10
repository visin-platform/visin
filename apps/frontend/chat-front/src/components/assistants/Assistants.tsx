import { AutoAwesome } from '@mui/icons-material';
import { useState } from 'react';
import { AssistantProfileForm } from './AssistantProfileForm';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useAssistants } from '../../hooks/useAssistants';
import type { PageContext } from '../../types/chat';
export function Assistants({
  busy,
  onAnalysis,
  pageContext,
  compact = false,
  search = ''
}: {
  busy: boolean;
  onAnalysis: (context: PageContext) => void;
  pageContext?: PageContext;
  compact?: boolean;
  search?: string;
}) {
  const [profile, setProfile] = useState<{ id: string; name: string }>();
  const {
    catalog,
    rows,
    editing,
    setEditing,
    form,
    setForm,
    error,
    saving,
    confirmDelete,
    setConfirmDelete,
    empty,
    save,
    remove,
    makeDefault
  } = useAssistants();
  if (compact) {
    const bots = [...rows, ...catalog.filter((bot) => !rows.some((row) => row._id === bot._id))].filter((bot) =>
      bot.name.toLowerCase().includes(search.trim().replace(/^@/, '').toLowerCase())
    );
    return (
      <List dense disablePadding aria-label="Assistants">
        {bots.map((bot) => (
          <ListItemButton
            key={bot._id}
            disabled={busy || bot.paused}
            onClick={() => onAnalysis({ ...pageContext, assistantId: bot._id, title: bot.name })}
            sx={{ borderRadius: 1, minHeight: 56 }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'primary.main' }}>
              <AutoAwesome />
            </ListItemIcon>
            <ListItemText
              primary={bot.name}
              secondary={
                bot.paused
                  ? 'Paused'
                  : rows.find((row) => row._id === bot._id)?.isDefault
                    ? 'Default analyst'
                    : 'Private assistant chat'
              }
            />
          </ListItemButton>
        ))}
        {error && <Alert severity="warning">Could not load your assistants.</Alert>}
      </List>
    );
  }
  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      {catalog
        .filter((bot) => !rows.some((row) => row._id === bot._id))
        .map((bot) => (
          <Button
            key={bot._id}
            disabled={busy || bot.paused}
            onClick={() => onAnalysis({ ...pageContext, assistantId: bot._id, title: bot.name })}
          >
            Ask {bot.name}
            {bot.paused ? ' (paused)' : ''}
          </Button>
        ))}
      <Typography sx={{ fontWeight: 600 }}>Your assistants</Typography>
      <Typography variant="body2" color="text.secondary">
        Reusable instructions for private research chats. Uses the configured analyst model. Changes apply to new
        questions.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {rows.map((row) => (
        <Stack key={row._id} direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            disabled={busy || saving || row.paused}
            onClick={() => onAnalysis({ ...pageContext, assistantId: row._id, title: row.name })}
          >
            {row.name}
            {row.paused ? ' (paused)' : row.isDefault ? ' (default analyst)' : ''}
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              setEditing(row._id);
              setForm({ name: row.name, personality: row.personality, paused: row.paused });
            }}
          >
            Edit {row.name}
          </Button>
          <Button disabled={saving} onClick={() => setProfile({ id: row._id, name: row.name })}>
            Profile for {row.name}
          </Button>
          {row.isDefault ? (
            <Button disabled={saving} onClick={() => void makeDefault(row, false)}>
              Stop using {row.name} by default
            </Button>
          ) : (
            <Button disabled={saving || row.paused} onClick={() => void makeDefault(row, true)}>
              Use {row.name} by default
            </Button>
          )}
          {confirmDelete === row._id ? (
            <>
              <Button color="error" disabled={saving} onClick={() => void remove(row._id)}>
                Confirm removal
              </Button>
              <Button onClick={() => setConfirmDelete(undefined)}>Keep</Button>
            </>
          ) : (
            <Button disabled={saving} onClick={() => setConfirmDelete(row._id)}>
              Remove {row.name}
            </Button>
          )}
        </Stack>
      ))}
      {profile && (
        <AssistantProfileForm
          key={profile.id}
          assistantId={profile.id}
          name={profile.name}
          onClose={() => setProfile(undefined)}
        />
      )}
      {confirmDelete && (
        <Typography variant="body2">
          Removing an assistant stops new replies in its chats. Existing messages remain.
        </Typography>
      )}
      <Stack
        component="form"
        spacing={1}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Assistant name"
          value={form.name}
          required
          slotProps={{ htmlInput: { maxLength: 60 } }}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <TextField
          label="Communication instructions"
          multiline
          minRows={2}
          value={form.personality}
          slotProps={{ htmlInput: { maxLength: 1500 } }}
          onChange={(event) => setForm({ ...form, personality: event.target.value })}
        />
        <FormControlLabel
          label="Paused"
          control={
            <Checkbox checked={form.paused} onChange={(event) => setForm({ ...form, paused: event.target.checked })} />
          }
        />
        <Stack direction="row" spacing={1}>
          <Button type="submit" disabled={saving || !form.name.trim()}>
            {editing ? 'Save assistant' : 'Create assistant'}
          </Button>
          {editing && (
            <Button
              onClick={() => {
                setEditing(undefined);
                setForm(empty);
              }}
            >
              Cancel editing
            </Button>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
