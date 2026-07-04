import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorOutlined } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { Loader } from '@visin/frontend-core';

const LoginRedirect = () => {
  const navigate = useNavigate();
  const { refresh, login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await refresh();
        if (result.authenticated) {
          navigate('/account', { replace: true });
        } else {
          setError('Authentication failed. Please try logging in again.');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setError('Authentication check failed. Please try logging in again.');
      }
    };

    checkAuth();
  }, [navigate, refresh]);

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        bgcolor: 'background.default',
        p: 3
      }}>
        <Paper variant="outlined" sx={{ 
          p: 4, 
          maxWidth: 400, 
          textAlign: 'center',
          borderRadius: 3,
          borderColor: 'divider'
        }}>
          <ErrorOutlined sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom sx={{
            fontWeight: 700
          }}>
            Login Error
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 3
            }}>
            {error}
          </Typography>
          <Button 
            variant="contained" 
            fullWidth 
            onClick={() => login()}
            sx={{ borderRadius: 2, py: 1.2 }}
          >
            Try Login Again
          </Button>
        </Paper>
      </Box>
    );
  }

  return <Loader message="Checking authentication..." />;
};

export default LoginRedirect;