import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Divider, Paper, Typography } from '@mui/material';
import { createAuthService, type AuthUser } from '@visin/frontend-core';
import { initializeGoogleSignIn } from '../authFlow';
import LoggedInUser from '../components/LoggedInUser';
import GoogleLinkForm from '../components/GoogleLinkForm';
import CredentialsForm, { type CredentialsValues, type CredentialsMode } from '../components/CredentialsForm';
import * as authApi from '../services/authApi';
import { useConfig } from '../config/useConfig';

type Phase = 'checking' | 'authenticated' | 'form';

const HEADINGS: Record<CredentialsMode, { title: string; subtitle: string }> = {
  setup: {
    title: 'Create the owner account',
    subtitle: 'This instance has no users yet. The account you create now administers it.'
  },
  login: { title: 'Sign in', subtitle: 'Access your dashboard using your credentials' },
  register: { title: 'Create an account', subtitle: 'Sign up with your email address — it takes a moment' }
};

const LoginPage: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [mode, setMode] = useState<CredentialsMode>('login');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const config = useConfig();
  // auth-front never redirects to itself, so authFrontUrl is unused here.
  const authService = useMemo(
    () => createAuthService({ authServiceUrl: () => config.AUTH_SERVICE_URL || '', authFrontUrl: () => '' }),
    [config.AUTH_SERVICE_URL]
  );

  const redirectUri = useCallback(
    () => new URLSearchParams(window.location.search).get('redirect_uri') || '/',
    []
  );

  useEffect(() => {
    const start = async () => {
      const result = await authService.checkAuth();
      if (result.authenticated) {
        setUser(result.user);
        setPhase('authenticated');
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const errorParam = urlParams.get('error');
      if (errorParam) {
        setError(decodeURIComponent(errorParam));
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('error');
        window.history.replaceState({}, '', newUrl.toString());
      }

      // A fresh deployment has no users and no way to make one, so the first
      // visitor is offered setup rather than a login that could never succeed.
      // `?mode=register`, from another front's "Sign up": the sign-up form rather than sign-in.
      const wantsRegister = urlParams.get('mode') === 'register';
      try {
        const status = await authApi.getSetupStatus();
        setMode(status.needsSetup ? 'setup' : wantsRegister ? 'register' : 'login');
        setGoogleEnabled(status.googleEnabled && Boolean(config.GOOGLE_CLIENT_ID));
      } catch {
        // auth-service unreachable: still show the login form, so the failure
        // surfaces on submit with a real message rather than as a blank page.
        if (wantsRegister) setMode('register');
        setGoogleEnabled(Boolean(config.GOOGLE_CLIENT_ID));
      }
      setPhase('form');
    };
    start();
  }, [authService, config.GOOGLE_CLIENT_ID]);

  // Google renders its button into a DOM node, so it can only be initialised
  // once that node exists — i.e. after the form phase has rendered. Signing in
  // with an unknown Google account creates one, so registration offers it too.
  useEffect(() => {
    if (phase !== 'form' || mode === 'setup' || !googleEnabled || !config.GOOGLE_CLIENT_ID) return;
    try {
      initializeGoogleSignIn(config.GOOGLE_CLIENT_ID, redirectUri());
    } catch (err) {
      setError('Failed to initialize Google Sign-In: ' + (err as Error).message);
    }
  }, [phase, mode, googleEnabled, config.GOOGLE_CLIENT_ID, redirectUri]);

  const switchMode = (next: CredentialsMode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (values: CredentialsValues) => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await authApi.login(values.email, values.password);
        window.location.href = redirectUri();
        return;
      }
      if (mode === 'setup') {
        await authApi.setupFirstUser(values);
        window.location.href = redirectUri();
        return;
      }
      // Registering signs you in: access is decided by group membership, not by
      // an approval step, so there is nothing to wait for.
      await authApi.register(values);
      window.location.href = redirectUri();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (await authService.logout()) {
      setUser(null);
      window.location.reload();
    }
  };

  const heading = HEADINGS[mode];

  return (
    <Box component="main" sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 2, py: 5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <Box component="img" src="/logo.svg" alt="" sx={{ width: 36, height: 36 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '1.5rem' }}>Visin</Typography>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 440, borderRadius: 3, p: { xs: 3, sm: 4 } }}>
          {phase === 'checking' && (
            <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={36} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Checking your session…
              </Typography>
            </Box>
          )}

          {phase === 'authenticated' && user && (
            <>
              <Typography component="h1" variant="h4" gutterBottom sx={{ fontWeight: 800 }}>
                Welcome back
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary', mb: 5 }}>
                You are currently signed in
              </Typography>
              <LoggedInUser
                user={user}
                onContinue={() => {
                  window.location.href = redirectUri();
                }}
                onLogout={handleLogout}
              />
              {config.GOOGLE_CLIENT_ID && <GoogleLinkForm clientId={config.GOOGLE_CLIENT_ID} />}
            </>
          )}

          {phase === 'form' && (
            <>
              <Typography component="h1" variant="h4" gutterBottom sx={{ fontWeight: 800 }}>
                {heading.title}
              </Typography>
              <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
                {heading.subtitle}
              </Typography>

              <CredentialsForm mode={mode} busy={busy} error={error} onSubmit={handleSubmit} />

              {mode !== 'setup' && googleEnabled && (
                <>
                  <Divider sx={{ my: 3, color: 'text.secondary', fontSize: '0.8rem' }}>OR</Divider>
                  <Box id="google-signin-button" sx={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
                </>
              )}

              {mode !== 'setup' && (
                <Box sx={{ mt: 4, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                    <Button
                      size="small"
                      onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                      sx={{ textTransform: 'none' }}
                    >
                      {mode === 'login' ? 'Create one' : 'Sign in'}
                    </Button>
                  </Typography>
                </Box>
              )}
            </>
          )}

          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              © {new Date().getFullYear()} Visin
            </Typography>
          </Box>
      </Paper>
    </Box>
  );
};

export default LoginPage;
