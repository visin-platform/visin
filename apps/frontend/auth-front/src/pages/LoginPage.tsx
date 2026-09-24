import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Divider, Grid, Paper, Typography } from '@mui/material';
import { createAuthService, type AuthUser } from '@visin/frontend-core';
import { initializeGoogleSignIn } from '../authFlow';
import LoggedInUser from '../components/LoggedInUser';
import GoogleLinkForm from '../components/GoogleLinkForm';
import CredentialsForm, { type CredentialsValues, type CredentialsMode } from '../components/CredentialsForm';
import * as authApi from '../services/authApi';
import { useConfig } from '../config/useConfig';

type Phase = 'checking' | 'authenticated' | 'form';

/* eslint-disable no-restricted-syntax -- The brand panel is the landing page's dark ink in either scheme,
   so its colours are its own rather than the theme's. */
const BRAND_PANEL = {
  ink: '#111827',
  text: '#fff',
  glowNarrow: 'radial-gradient(500px 200px at 20% 0%, rgba(37,99,235,0.45), transparent 65%)',
  glowWide:
    'radial-gradient(800px 400px at 20% 0%, rgba(37,99,235,0.4), transparent 60%), radial-gradient(600px 400px at 90% 20%, rgba(96,165,250,0.2), transparent 55%)',
  shotBorder: '1px solid rgba(255,255,255,0.14)',
  shotShadow: '0 30px 80px rgba(2, 6, 23, 0.55)'
} as const;
/* eslint-enable no-restricted-syntax */

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
      try {
        const status = await authApi.getSetupStatus();
        setMode(status.needsSetup ? 'setup' : 'login');
        setGoogleEnabled(status.googleEnabled && Boolean(config.GOOGLE_CLIENT_ID));
      } catch {
        // auth-service unreachable: still show the login form, so the failure
        // surfaces on submit with a real message rather than as a blank page.
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
    <Grid container component="main" sx={{ minHeight: '100vh', alignContent: { xs: 'flex-start', md: 'stretch' } }}>
      {/* On a phone, the brand is a dark band across the top — the same ink the
          app bar has once you are in — with the form on white below it. */}
      <Grid
        size={12}
        sx={{
          display: { xs: 'flex', md: 'none' },
          alignItems: 'center',
          gap: 1.5,
          px: 3,
          pt: 'calc(20px + env(safe-area-inset-top))',
          pb: 3,
          bgcolor: BRAND_PANEL.ink,
          color: BRAND_PANEL.text,
          backgroundImage: BRAND_PANEL.glowNarrow
        }}
      >
        <Box component="img" src="/logo.svg" alt="" sx={{ width: 32, height: 32 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '1.35rem' }}>Visin</Typography>
      </Grid>

      {/* Brand panel, painted with the product's own colours rather than a
          stock photo, so it costs no third-party request. */}
      <Grid
        size={{ xs: 0, md: 6 }}
        sx={{
          // From `md` only: at tablet widths a third of the screen left the
          // panel's heading one word per line and squeezed the form beside it,
          // so below that the form takes the whole width and the wordmark
          // above it carries the brand instead.
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          p: { md: 5, lg: 7 },
          bgcolor: BRAND_PANEL.ink,
          color: BRAND_PANEL.text,
          backgroundImage: BRAND_PANEL.glowWide
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 'auto' }}>
          <Box component="img" src="/logo.svg" alt="" sx={{ width: 36, height: 36 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '1.5rem' }}>Visin</Typography>
        </Box>
        {/* The product itself, rather than a paragraph about it. */}
        <Box
          component="img"
          src="/showcase/charts.webp"
          alt="Loss and mean IoU curves of a training run in Visin"
          sx={{
            width: '100%',
            maxWidth: 640,
            borderRadius: '14px',
            border: BRAND_PANEL.shotBorder,
            boxShadow: BRAND_PANEL.shotShadow,
            my: 5
          }}
        />
        <Typography sx={{ fontSize: { md: '1.6rem', lg: '1.9rem' }, fontWeight: 700, lineHeight: 1.2, maxWidth: 560 }}>
          Every epoch, score and frame your training produces — in one place.
        </Typography>
      </Grid>

      <Grid
        size={{ xs: 12, md: 6 }}
        component={Paper}
        elevation={0}
        square
        sx={{ display: 'flex', flexDirection: 'column', justifyContent: { xs: 'flex-start', md: 'center' }, alignItems: 'center' }}
      >
        <Box sx={{ my: { xs: 4, md: 8 }, width: '100%', maxWidth: 440, px: { xs: 3, sm: 4 } }}>

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

          <Box sx={{ mt: 8, textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              © {new Date().getFullYear()} Visin
            </Typography>
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
};

export default LoginPage;
