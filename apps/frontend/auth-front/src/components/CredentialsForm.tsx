import React, { useState } from 'react';
import { Alert, Box, Button, Stack, TextField } from '@mui/material';
import { MIN_PASSWORD_LENGTH } from '../passwordPolicy';

export type CredentialsMode = 'login' | 'register' | 'setup';

export interface CredentialsValues {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface CredentialsFormProps {
  mode: CredentialsMode;
  busy: boolean;
  error?: string | null;
  onSubmit: (values: CredentialsValues) => void;
}

const SUBMIT_LABEL: Record<CredentialsMode, string> = {
  login: 'Sign in',
  register: 'Create account',
  setup: 'Create owner account'
};

/**
 * One form for all three password flows — they differ only in which fields
 * show and what the button says. Login deliberately does not enforce the
 * length rule: an existing password that predates a policy change must still
 * be submittable, and the server is the authority either way.
 */
const CredentialsForm: React.FC<CredentialsFormProps> = ({ mode, busy, error, onSubmit }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const collectsName = mode !== 'login';
  const enforcesLength = mode !== 'login';
  const tooShort = enforcesLength && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !tooShort && !busy;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      email: email.trim(),
      password,
      ...(collectsName ? { firstName: firstName.trim(), lastName: lastName.trim() } : {})
    });
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}

        {collectsName && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={busy}
              fullWidth
              autoComplete="given-name"
            />
            <TextField
              label="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              disabled={busy}
              fullWidth
              autoComplete="family-name"
            />
          </Stack>
        )}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
          required
          fullWidth
          autoComplete="email"
        />

        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          required
          fullWidth
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          error={tooShort}
          helperText={
            enforcesLength ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined
          }
        />

        <Button type="submit" variant="contained" size="large" disabled={!canSubmit} sx={{ borderRadius: 2 }}>
          {busy ? 'Please wait…' : SUBMIT_LABEL[mode]}
        </Button>
      </Stack>
    </Box>
  );
};

export default CredentialsForm;
