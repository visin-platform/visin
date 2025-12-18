import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  Avatar, 
  useTheme,
  Divider,
  Switch,
  FormControlLabel
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { 
  CloudDownload, 
  DeleteForever, 
  Visibility, 
  PrivacyTip
} from '@mui/icons-material';

const DataTab: React.FC = () => {
  const theme = useTheme();

  const DataSection = ({ icon, title, description, action, danger }: any) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3, py: 3 }}>
      <Avatar sx={{ 
        bgcolor: danger ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.primary.main, 0.1), 
        color: danger ? 'error.main' : 'primary.main' 
      }}>
        {icon}
      </Avatar>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{description}</Typography>
        {action}
      </Box>
    </Box>
  );

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>Data & Privacy</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your personal data, export your information, or delete your account.
          </Typography>
        </Box>

        <DataSection 
          icon={<CloudDownload fontSize="small" />}
          title="Download your data"
          description="Get a copy of your data to keep or move to another service. This includes your profile info, groups, and activity."
          action={
            <Button variant="outlined" size="small" startIcon={<CloudDownload />} sx={{ borderRadius: 2, textTransform: 'none' }}>
              Request Export
            </Button>
          }
        />
        
        <Divider />

        <DataSection 
          icon={<Visibility fontSize="small" />}
          title="Privacy Preferences"
          description="Control how your data is used for personalization and analytics."
          action={
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <FormControlLabel 
                control={<Switch defaultChecked size="small" />} 
                label={<Typography variant="body2">Personalized experience</Typography>} 
              />
              <FormControlLabel 
                control={<Switch defaultChecked size="small" />} 
                label={<Typography variant="body2">Usage analytics</Typography>} 
              />
            </Box>
          }
        />

        <Divider />

        <DataSection 
          icon={<DeleteForever fontSize="small" />}
          title="Delete Account"
          description="Permanently delete your account and all associated data. This action cannot be undone."
          danger
          action={
            <Button variant="outlined" color="error" size="small" sx={{ borderRadius: 2, textTransform: 'none' }}>
              Delete Account...
            </Button>
          }
        />
      </Paper>

      <Box sx={{ mt: 4, p: 3, bgcolor: alpha(theme.palette.info.main, 0.03), borderRadius: 3, border: '1px solid', borderColor: alpha(theme.palette.info.main, 0.1), display: 'flex', alignItems: 'center', gap: 2 }}>
        <PrivacyTip color="info" />
        <Box>
          <Typography variant="subtitle2" fontWeight={600}>Privacy Policy</Typography>
          <Typography variant="caption" color="text.secondary">
            Learn more about how we handle your data in our Privacy Policy.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default DataTab;