import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';

const NOTES_MAX = 5000;

interface RunNotesProps {
  notes?: string;
  /** whoever may write to the run */
  canEdit: boolean;
  /** save the text; an empty string removes the note */
  onSave: (notes: string) => Promise<unknown>;
}

/**
 * The researcher's own commentary on a run: "this one used the relabelled night
 * set", "rerun with seed 2". Apart from the description, which says what the run
 * is, and from findings, which hold conclusions. Anyone who can see the run reads
 * it; anyone who can write to it edits it here.
 */
const RunNotes: React.FC<RunNotesProps> = ({ notes, canEdit, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(notes ?? '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the note');
    } finally {
      setSaving(false);
    }
  };

  if (!notes && !canEdit) return null;

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
            Notes
          </Typography>
          {canEdit && !editing && (
            <Button size="small" onClick={start}>
              {notes ? 'Edit' : 'Add a note'}
            </Button>
          )}
        </Stack>
        {editing ? (
          <Box>
            <TextField
              multiline
              fullWidth
              minRows={3}
              label="Note"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={saving}
              error={draft.length > NOTES_MAX}
              helperText={`${draft.length.toLocaleString()} / ${NOTES_MAX.toLocaleString()}`}
              autoFocus
            />
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button variant="contained" onClick={save} disabled={saving || draft.length > NOTES_MAX}>Save</Button>
            </Stack>
          </Box>
        ) : notes ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {notes}
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No notes yet. Use this for what the run does not say itself: what you changed, what to compare it with.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default RunNotes;
