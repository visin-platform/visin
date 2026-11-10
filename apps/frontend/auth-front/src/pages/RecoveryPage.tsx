import { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { getGlobalConfig } from '../config/ConfigProvider';
export default function RecoveryPage() {
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    navigate('/recover', { replace: true });
  }, [navigate]);
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const base = getGlobalConfig().AUTH_SERVICE_URL;
      if (!base) throw new Error('Authentication is not configured');
      const response = await fetch(`${base.replace(/\/$/, '')}/auth/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Recovery could not be completed');
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery could not be completed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', p: 3 }}>
      <Typography variant="h4">Recover your account</Typography>
      {done ? (
        <>
          <Alert severity="success">
            Your password was replaced and existing credentials were revoked. Sign in again.
          </Alert>
          <Button onClick={() => navigate('/')}>Sign in</Button>
        </>
      ) : (
        <>
          {!token && <Alert severity="warning">Open the complete recovery link supplied by your administrator.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button
            disabled={!token || busy || password.length < 10 || password.length > 200 || password !== confirmation}
            onClick={() => void submit()}
          >
            Set new password
          </Button>
        </>
      )}
    </Stack>
  );
}
