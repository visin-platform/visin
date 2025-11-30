import React from 'react';
import { Box, Avatar, Typography, Stack, Button, Paper } from '@mui/material';
import { ArrowForward, Logout } from '@mui/icons-material';

interface LoggedInUserProps {
  user: {
    name: string;
    email: string;
    picture?: string;
  };
  onContinue: () => void;
  onLogout: () => void;
}

const LoggedInUser: React.FC<LoggedInUserProps> = ({ user, onContinue, onLogout }) => (
  <Box sx={{ width: '100%' }}>
    <Paper 
      elevation={0} 
      sx={{ 
        p: 3, 
        mb: 4, 
        bgcolor: '#f8fafc', 
        borderRadius: 3,
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      <Avatar 
        src={user.picture} 
        alt={user.name} 
        sx={{ 
          width: 80, 
          height: 80, 
          mb: 2,
          border: '4px solid white',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }} 
      />
      <Typography variant="h6" fontWeight={700} color="#0f172a" gutterBottom>
        {user.name}
      </Typography>
      <Typography variant="body2" color="#64748b">
        {user.email}
      </Typography>
    </Paper>

    <Stack spacing={2} width="100%">
      <Button 
        variant="contained" 
        size="large"
        onClick={onContinue} 
        endIcon={<ArrowForward />}
        sx={{ 
          py: 1.5, 
          borderRadius: 2,
          textTransform: 'none',
          fontSize: '1rem',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }
        }}
      >
        Continue to App
      </Button>
      <Button 
        variant="outlined" 
        color="inherit"
        size="large"
        onClick={onLogout} 
        startIcon={<Logout />}
        sx={{ 
          py: 1.5, 
          borderRadius: 2,
          textTransform: 'none',
          fontSize: '1rem',
          fontWeight: 500,
          color: '#64748b',
          borderColor: '#e2e8f0',
          '&:hover': {
            borderColor: '#cbd5e1',
            bgcolor: '#f8fafc',
            color: '#0f172a'
          }
        }}
      >
        Sign out
      </Button>
    </Stack>
  </Box>
);

export default LoggedInUser;
