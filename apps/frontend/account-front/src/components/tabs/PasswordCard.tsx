import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { profileService } from '../../services/profileService';

/** Mirrors MIN_PASSWORD_LENGTH in auth-service's passwordService. */
const MIN_PASSWORD_LENGTH = 10;

interface PasswordCardProps {
  /** False for an account created through Google, which has no password yet. */
  hasPassword: boolean;
  onChanged: () => void;
}

/**
 * Sets a first password or changes an existing one.
 *
 * An account created through Google sign-in has no password, so there is
 * nothing to confirm against — the current-password field only appears once one
 * exists. Changing it signs out every other session, which is worth saying out
 * loud rather than surprising someone with.
 */
const PasswordCard: React.FC<PasswordCardProps> = ({ hasPassword, onChanged }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword === newPassword &&
    (!hasPassword || currentPassword.length > 0) &&
    !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const message = await profileService.changePassword({
        ...(hasPassword ? { currentPassword } : {}),
        newPassword
      });
      setSuccess(message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, borderColor: 'divider' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          {hasPassword ? 'Change password' : 'Set a password'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {hasPassword
            ? 'Changing your password signs out every other device.'
            : 'You signed in with Google. Set a password to also sign in with your email address.'}
        </Typography>
      </Box>

      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.5} sx={{ maxWidth: 420 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}

          {hasPassword && (
            <TextField
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={saving}
              size="small"
              fullWidth
              autoComplete="current-password"
            />
          )}

          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={saving}
            size="small"
            fullWidth
            autoComplete="new-password"
            error={tooShort}
            helperText={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />

          <TextField
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={saving}
            size="small"
            fullWidth
            autoComplete="new-password"
            error={mismatch}
            helperText={mismatch ? 'Passwords do not match' : ' '}
          />

          <Box>
            <Button type="submit" variant="contained" disabled={!canSubmit} sx={{ borderRadius: 2 }}>
              {saving ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
};

export default PasswordCard;
