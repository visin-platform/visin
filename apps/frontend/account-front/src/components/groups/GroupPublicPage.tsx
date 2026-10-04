import React, { useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Link, Switch, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { ApiError } from '@visin/frontend-core';
import { useUpdateGroupPage } from '../../hooks/useGroups';
import { Group } from '../../types/group';

const MAX_DESCRIPTION = 280;

/**
 * A group's public page, which only its owner can change. Off until they turn it on: a group's name and
 * existence are private by default, and the page shows nothing about its members.
 */
const GroupPublicPage: React.FC<{ group: Group }> = ({ group }) => {
  const saved = { handle: group.handle ?? '', description: group.description ?? '', profilePublic: Boolean(group.profilePublic) };
  const [values, setValues] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateGroupPage();

  const changed =
    values.handle !== saved.handle || values.description !== saved.description || values.profilePublic !== saved.profilePublic;
  // The page needs a handle, so it cannot be switched on without one.
  const missingHandle = values.profilePublic && !values.handle;

  const save = () => {
    setError(null);
    update.mutate(
      {
        groupId: group._id,
        page: {
          // Only what changed: sending the handle it already has would still ask the server to claim it.
          ...(values.handle !== saved.handle && values.handle ? { handle: values.handle } : {}),
          description: values.description.trim(),
          profilePublic: values.profilePublic
        }
      },
      {
        // A refused handle says why (taken, reserved); anything else is not the owner's to fix.
        onError: (failure) => {
          const refused = failure instanceof ApiError && (failure.status === 400 || failure.status === 409);
          setError(refused ? failure.message : 'Could not save the public page');
        }
      }
    );
  };

  return (
    <Box component="section" aria-label="Public page" sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Public page
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Shows the group's name and what you write here to anyone, beside the projects and datasets it makes public.
        Never its members.
        {group.profilePublic && group.handle && (
          <>
            {' '}
            <Link component={RouterLink} to={`/g/${group.handle}`}>
              View the page
            </Link>
          </>
        )}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
        <TextField
          size="small"
          label="Handle"
          value={values.handle}
          disabled={update.isPending}
          onChange={(event) => setValues({ ...values, handle: event.target.value.toLowerCase() })}
          slotProps={{ htmlInput: { maxLength: 30, autoCapitalize: 'none', spellCheck: false } }}
          helperText={`The page is /g/${values.handle || 'handle'}. 3 to 30 lowercase letters, digits or hyphens.`}
        />
        <TextField
          size="small"
          label="Description"
          multiline
          minRows={2}
          value={values.description}
          disabled={update.isPending}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          slotProps={{ htmlInput: { maxLength: MAX_DESCRIPTION } }}
          helperText={`${values.description.length}/${MAX_DESCRIPTION}`}
        />
        <FormControlLabel
          control={
            <Switch
              checked={values.profilePublic}
              disabled={update.isPending}
              onChange={(event) => setValues({ ...values, profilePublic: event.target.checked })}
            />
          }
          label="Show the public page"
        />
        {missingHandle && (
          <Typography variant="body2" sx={{ color: 'error.main', mt: -1 }}>
            Choose a handle first.
          </Typography>
        )}
        <Box>
          <Button variant="contained" size="small" disabled={!changed || missingHandle || update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save public page'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default GroupPublicPage;
