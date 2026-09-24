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
        bgcolor: 'background.default',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
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
          border: '4px solid',
          borderColor: 'background.paper',
          boxShadow: 2
        }} 
      />
      <Typography
        variant="h6"
        gutterBottom
        sx={{
          fontWeight: 700,
          color: 'text.primary'
        }}>
        {user.name}
      </Typography>
      <Typography variant="body2" sx={{
        color: 'text.secondary'
      }}>
        {user.email}
      </Typography>
    </Paper>

    <Stack spacing={2} sx={{
      width: "100%"
    }}>
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
            boxShadow: 3
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
          color: 'text.secondary',
          borderColor: 'divider',
          '&:hover': {
            borderColor: 'text.disabled',
            bgcolor: 'action.hover',
            color: 'text.primary'
          }
        }}
      >
        Sign out
      </Button>
    </Stack>
  </Box>
);

export default LoggedInUser;
