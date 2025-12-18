import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';
import { authService } from '../services/authService';
import { Loader } from './Loader';

const LoginRedirect = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authenticated = await authService.isAuthenticated();
        if (authenticated) {
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
  }, [navigate]);

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
          <ErrorOutline sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Login Error
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {error}
          </Typography>
          <Button 
            variant="contained" 
            fullWidth 
            onClick={() => authService.redirectToLogin()}
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