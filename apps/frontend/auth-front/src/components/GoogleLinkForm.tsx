import { useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { initializeGoogleSignIn } from '../authFlow';
import { linkGoogle } from '../services/authApi';

export default function GoogleLinkForm({ clientId }: { clientId: string }) {
  const [password, setPassword] = useState('');
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const [error, setError] = useState('');
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (!confirmedPassword) return;
    let active = true;
    let submitted = false;
    initializeGoogleSignIn(clientId, '/', async ({ credential }) => {
      if (!active || submitted) return;
      submitted = true;
      try {
        await linkGoogle(confirmedPassword, credential);
        if (active) setLinked(true);
      } catch (error) {
        if (active) setError((error as Error).message);
      } finally {
        if (active) setConfirmedPassword('');
      }
    });
    return () => { active = false; };
  }, [clientId, confirmedPassword]);

  if (linked) return <Alert severity="success" sx={{ mt: 3 }}>Google sign-in linked to this account.</Alert>;
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6">Link Google sign-in</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Enter this account’s current password, then choose the Google account that may sign in to it.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {confirmedPassword ? <>
        <Box id="google-signin-button" />
        <Button onClick={() => setConfirmedPassword('')}>Cancel linking</Button>
      </> : (
        <Box component="form" onSubmit={event => {
          event.preventDefault();
          setError('');
          setConfirmedPassword(password);
          setPassword('');
        }}>
          <TextField label="Current password" type="password" autoComplete="current-password" required
            value={password} onChange={event => setPassword(event.target.value)} fullWidth />
          <Button type="submit">Choose Google account</Button>
        </Box>
      )}
    </Box>
  );
}
