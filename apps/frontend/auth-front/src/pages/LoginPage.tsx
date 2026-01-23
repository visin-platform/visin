import React, { useEffect, useState } from 'react';
import { Box, Typography, Alert, Grid, Paper } from '@mui/material';
import { initializeGoogleSignIn } from '../authFlow';
import LoggedInUser from '../components/LoggedInUser';
import LoginPrompt from '../components/LoginPrompt';
import { useConfig } from '../config/useConfig';

const LoginPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [initializationAttempted, setInitializationAttempted] = useState(false);
  const config = useConfig();

  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const response = await fetch(`${config.AUTH_SERVICE_URL}/auth/verify`, {
          credentials: 'include'
        });
        const data = await response.json();
        if (data.success && data.authenticated) {
          setUser(data.user);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.log('No existing auth found:', err);
      }

      // Check for error in URL params
      const urlParams = new URLSearchParams(window.location.search);
      const errorParam = urlParams.get('error');
      if (errorParam) {
        setError(decodeURIComponent(errorParam));
        // Clean up the URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('error');
        window.history.replaceState({}, '', newUrl.toString());
      }

      const redirectUri = urlParams.get('redirect_uri') || '/';

      if (!config.GOOGLE_CLIENT_ID) {
        setError('Google Client ID is not configured. Please check your environment variables.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setInitializationAttempted(true);
      try {
        initializeGoogleSignIn(config.GOOGLE_CLIENT_ID, redirectUri);
      } catch (err) {
        console.error('Error initializing Google Sign-In:', err);
        setError('Failed to initialize Google Sign-In: ' + (err as Error).message);
      }
    };
    checkExistingAuth();
  }, [config]);

  const handleLogout = async () => {
    try {
      const response = await fetch(`${config.AUTH_SERVICE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        setUser(null);
        window.location.reload();
      }
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleContinue = () => {
    const redirectUri = new URLSearchParams(window.location.search).get('redirect_uri') || '/';
    window.location.href = redirectUri;
  };

  return (
    <Grid container component="main" sx={{ height: '100vh', overflow: 'hidden' }}>
      {/* Left Side - Image/Brand */}
      <Grid
        size={{ xs: 0, sm: 4, md: 7 }}
        sx={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop)',
          backgroundRepeat: 'no-repeat',
          backgroundColor: (t) =>
            t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.grey[900],
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
          display: { xs: 'none', sm: 'block' }
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.8) 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            p: 6
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box
              component="img"
              src="/logo.svg"
              alt="Visin Logo"
              sx={{
                width: 48,
                height: 48,
              }}
            />
            <Typography variant="h3" color="white" fontWeight="bold">
              Visin
            </Typography>
          </Box>
          <Typography variant="h5" color="rgba(255,255,255,0.9)" fontWeight={300} sx={{ maxWidth: 600 }}>
            Advanced Computer Vision & Analytics Platform
          </Typography>
          <Typography variant="body1" color="rgba(255,255,255,0.7)" sx={{ mt: 2, maxWidth: 500 }}>
            Manage your datasets, train models, and analyze results with our comprehensive suite of tools.
          </Typography>
        </Box>
      </Grid>

      {/* Right Side - Login Form */}
      <Grid 
        size={{ xs: 12, sm: 8, md: 5 }}
        component={Paper} 
        elevation={0} 
        square 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: '#ffffff'
        }}
      >
        <Box
          sx={{
            my: 8,
            mx: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            px: { xs: 2, sm: 4, md: 8 }
          }}
        >
          {/* Mobile Logo */}
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', gap: 1.5, mb: 4 }}>
             <Box
                component="img"
                src="/logo.svg"
                alt="Visin Logo"
                sx={{
                  width: 40,
                  height: 40,
                }}
             />
             <Typography variant="h5" fontWeight={700} color="#1e293b">
              Visin
            </Typography>
          </Box>

          <Typography component="h1" variant="h4" fontWeight={800} color="#0f172a" gutterBottom>
            {user ? 'Welcome Back' : 'Sign In'}
          </Typography>
          <Typography variant="body1" color="#64748b" sx={{ mb: 6, textAlign: 'center' }}>
            {user ? 'You are currently logged in' : 'Access your dashboard using your credentials'}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, width: '100%', borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ width: '100%' }}>
            {user ? (
              <LoggedInUser user={user} onContinue={handleContinue} onLogout={handleLogout} />
            ) : (
              <LoginPrompt isLoading={isLoading} initializationAttempted={initializationAttempted} error={error} />
            )}
          </Box>

          <Box sx={{ mt: 8, textAlign: 'center' }}>
            <Typography variant="caption" color="#94a3b8">
              © {new Date().getFullYear()} Visin. All rights reserved.
            </Typography>
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
};

export default LoginPage;