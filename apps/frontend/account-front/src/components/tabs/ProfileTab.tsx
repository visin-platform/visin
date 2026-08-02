import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Avatar,
  Alert,
  CircularProgress,
  Grid,
  Paper,
  Fade
} from '@mui/material';
import { Person, Save } from '@mui/icons-material';
import { authService } from '../../services/authService';
import { profileService } from '../../services/profileService';
import PasswordCard from './PasswordCard';
import { User } from '../../types';

const ProfileTab: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentUser = await authService.getProfile();
        if (currentUser) {
          setUser(currentUser);
          setEmail(currentUser.email);
          setFirstName(currentUser.firstName || '');
          setLastName(currentUser.lastName || '');
        }
      } catch (error) {
        console.error('Failed to load user data:', error);
        setMessage({ type: 'error', text: 'Failed to load user data' });
      } finally {
        setLoading(false);
      }
    };
    loadUserData();
  }, []);

  useEffect(() => {
    if (user) {
      const currentFirstName = user.firstName || '';
      const currentLastName = user.lastName || '';
      setHasChanges(firstName !== currentFirstName || lastName !== currentLastName);
    }
  }, [firstName, lastName, user]);

  const handleSave = async () => {
    if (!user || !hasChanges) return;
    setSaving(true);
    setMessage(null);

    try {
      const response = await profileService.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim()
      });

      if (response.success) {
        setUser(response.user);
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        setHasChanges(false);
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to update profile' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setHasChanges(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress size={32} thickness={5} />
      </Box>
    );
  }

  const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom sx={{
        fontWeight: 600
      }}>{title}</Typography>
      <Typography variant="body2" sx={{
        color: "text.secondary"
      }}>{subtitle}</Typography>
    </Box>
  );

  return (
    <Fade in={!loading}>
      <Box>
        {message && (
          <Alert 
            severity={message.type} 
            sx={{ mb: 4, borderRadius: 2, border: '1px solid', borderColor: `${message.type}.light` }}
            onClose={() => setMessage(null)}
          >
            {message.text}
          </Alert>
        )}

        <Grid container spacing={6}>
          {/* Personal Info Section */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <SectionHeader 
                title="Personal Information" 
                subtitle="Update your photo and personal details here." 
              />
              
              <Grid container spacing={4} sx={{
                alignItems: "center"
              }}>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Box sx={{ width: 100, height: 100, mx: { xs: 'auto', md: 0 } }}>
                    <Avatar
                      src={user?.picture}
                      sx={{ width: 100, height: 100, border: '1px solid', borderColor: 'divider' }}
                    >
                      <Person sx={{ fontSize: 40 }} />
                    </Avatar>
                  </Box>
                </Grid>
                
                <Grid size={{ xs: 12, md: 9 }}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        label="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        variant="outlined"
                        size="small"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        label="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        variant="outlined"
                        size="small"
                      />
                    </Grid>
                    <Grid size={12}>
                      <TextField
                        fullWidth
                        label="Email Address"
                        value={email}
                        disabled
                        variant="outlined"
                        size="small"
                        helperText="Email cannot be changed as it is linked to your login."
                      />
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid size={12}>
            <PasswordCard
              hasPassword={Boolean(user?.hasPassword)}
              onChanged={() => setUser((current) => (current ? { ...current, hasPassword: true } : current))}
            />
          </Grid>

        </Grid>

        {/* Action Bar */}
        <Box sx={{ 
          mt: 6, 
          pt: 4, 
          borderTop: '1px solid', 
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2
        }}>
          <Button 
            onClick={handleCancel}
            disabled={saving || !hasChanges}
            sx={{ color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSave}
            disabled={saving || !hasChanges}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
            sx={{ px: 4, borderRadius: 2 }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>
    </Fade>
  );
};

export default ProfileTab;
