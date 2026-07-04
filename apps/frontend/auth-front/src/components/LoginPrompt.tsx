import React from 'react';
import { Box, Typography, CircularProgress, Fade } from '@mui/material';

interface LoginPromptProps {
  isLoading: boolean;
  initializationAttempted: boolean;
  error?: string | null;
}

const LoginPrompt: React.FC<LoginPromptProps> = ({ isLoading, initializationAttempted, error }) => (
  <Box sx={{ width: '100%', minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
    {isLoading ? (
      <Fade in={true}>
        <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress size={40} thickness={4} sx={{ color: 'primary.main', mb: 3 }} />
          <Typography
            variant="body2"
            sx={{
              color: "#64748b",
              fontWeight: 500
            }}>
            Initializing secure connection...
          </Typography>
        </Box>
      </Fade>
    ) : (
      <Fade in={true}>
        <Box>
          <Box
            id="google-signin-button"
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 64,
              width: '100%',
              mb: 3
            }}
          >
            {initializationAttempted ? (
              <Box sx={{ textAlign: 'center' }}>
                <CircularProgress size={24} sx={{ color: '#94a3b8', mb: 1 }} />
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: "#94a3b8"
                  }}>
                  Loading Google Sign-In...
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" sx={{
                color: "#94a3b8"
              }}>
                Preparing authentication...
              </Typography>
            )}
          </Box>
          
          <Box sx={{ position: 'relative', mb: 3 }}>
            <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', bgcolor: '#e2e8f0' }} />
            <Box sx={{ position: 'relative', display: 'inline-block', px: 2, bgcolor: 'white' }}>
              <Typography
                variant="caption"
                sx={{
                  color: "#94a3b8",
                  fontWeight: 500
                }}>
                SECURE LOGIN
              </Typography>
            </Box>
          </Box>

          <Typography
            variant="body2"
            sx={{
              color: "#64748b",
              px: 2
            }}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Typography>
          
          {error && (
            <Typography
              variant="body2"
              sx={{
                color: "error.main",
                mt: 2,
                fontWeight: 500
              }}>
              {error}
            </Typography>
          )}
        </Box>
      </Fade>
    )}
  </Box>
);

export default LoginPrompt;
