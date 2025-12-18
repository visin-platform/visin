import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  Avatar, 
  useTheme,
  Divider
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { 
  Lock, 
  PhonelinkLock, 
  History, 
  Security
} from '@mui/icons-material';

const SecurityTab: React.FC = () => {
  const theme = useTheme();

  const SecurityItem = ({ icon, title, description, actionLabel }: any) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}>
          {icon}
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        </Box>
      </Box>
      <Button 
        variant="outlined" 
        size="small" 
        sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
      >
        {actionLabel}
      </Button>
    </Box>
  );

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>Security Settings</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your password and protect your account with additional security layers.
          </Typography>
        </Box>

        <SecurityItem 
          icon={<Lock fontSize="small" />}
          title="Password"
          description="Last changed 3 months ago. Use a strong, unique password."
          actionLabel="Change"
        />
        <Divider />
        <SecurityItem 
          icon={<PhonelinkLock fontSize="small" />}
          title="Two-Factor Authentication"
          description="Add an extra layer of security to your account."
          actionLabel="Enable"
        />
        <Divider />
        <SecurityItem 
          icon={<History fontSize="small" />}
          title="Login History"
          description="Review your recent account activity and active sessions."
          actionLabel="View"
        />
      </Paper>

      <Box sx={{ mt: 4, p: 3, bgcolor: alpha(theme.palette.primary.main, 0.03), borderRadius: 3, border: '1px dashed', borderColor: 'primary.light', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Security color="primary" />
        <Box>
          <Typography variant="subtitle2" fontWeight={600}>Security Recommendation</Typography>
          <Typography variant="caption" color="text.secondary">
            We recommend enabling Two-Factor Authentication to keep your account safe.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default SecurityTab;