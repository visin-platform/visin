import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Paper,
  Fade
} from '@mui/material';
import { ApiError } from '@visin/frontend-core';
import { Person, Save } from '@mui/icons-material';
import { profileService } from '../../services/profileService';
import { useQueryClient } from '@tanstack/react-query';
import PasswordCard from './PasswordCard';
import AvatarEditor from './AvatarEditor';
import PublicProfileCard from './PublicProfileCard';
import { cleanLinks, type PublicProfileValues } from './publicProfile';
import SessionsCard from './SessionsCard';
import AppearanceCard from './AppearanceCard';
import { sessionKeys } from '../../hooks/useSessions';
import { profileKeys, useProfile } from '../../hooks/useProfile';
import { User } from '../../types';

/** The public-page fields as the form shows them. */
const publicValuesOf = (user: User): PublicProfileValues => ({
  handle: user.handle ?? '',
  bio: user.bio ?? '',
  links: user.links ?? [],
  profilePublic: user.profilePublic === true,
  showActivity: user.showActivity !== false
});

const samePublicValues = (a: PublicProfileValues, b: PublicProfileValues): boolean =>
  a.handle === b.handle &&
  a.bio === b.bio &&
  a.profilePublic === b.profilePublic &&
  a.showActivity === b.showActivity &&
  cleanLinks(a.links).join('\n') === cleanLinks(b.links).join('\n');

const ProfileTab: React.FC = () => {
  const { data: user = null, isLoading: loading, error: loadError } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [publicProfile, setPublicProfile] = useState<PublicProfileValues>({
    handle: '',
    bio: '',
    links: [],
    profilePublic: false,
    showActivity: true
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const queryClient = useQueryClient();

  const updateCachedProfile = (update: (current: User | null) => User | null) =>
    queryClient.setQueryData<User | null>(profileKeys.mine, (current) => update(current ?? null));

  // Seed the form from the first profile that arrives, and only that one: a
  // later cache update (a password set, a save) must not wipe unsaved edits.
  const seeded = useRef(false);
  useEffect(() => {
    if (!user || seeded.current) return;
    seeded.current = true;
    setEmail(user.email);
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setPublicProfile(publicValuesOf(user));
  }, [user]);

  useEffect(() => {
    if (loadError) setMessage({ type: 'error', text: 'Failed to load user data' });
  }, [loadError]);

  useEffect(() => {
    if (user) {
      const currentFirstName = user.firstName || '';
      const currentLastName = user.lastName || '';
      setHasChanges(
        firstName !== currentFirstName ||
          lastName !== currentLastName ||
          !samePublicValues(publicProfile, publicValuesOf(user))
      );
    }
  }, [firstName, lastName, publicProfile, user]);

  const handleSave = async () => {
    if (!user || !hasChanges) return;
    const links = cleanLinks(publicProfile.links);
    setSaving(true);
    setMessage(null);

    try {
      const response = await profileService.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        // Only what changed: sending an unchanged handle would still ask the server to claim it.
        ...(publicProfile.handle !== (user.handle ?? '') && publicProfile.handle ? { handle: publicProfile.handle } : {}),
        bio: publicProfile.bio.trim(),
        links,
        profilePublic: publicProfile.profilePublic,
        showActivity: publicProfile.showActivity
      });

      if (response.success) {
        updateCachedProfile((current) => ({ ...(current ?? response.user), ...response.user }));
        setPublicProfile(publicValuesOf(response.user));
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        setHasChanges(false);
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to update profile' });
      }
    } catch (error) {
      // A refused handle or link says why (taken, reserved, not https); anything else is not the person's to fix.
      const refused = error instanceof ApiError && (error.status === 400 || error.status === 409);
      setMessage({ type: 'error', text: refused ? error.message : 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPublicProfile(publicValuesOf(user));
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
    <Box sx={{ mb: 3 }}>
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
            sx={{ mb: 3 }}
            onClose={() => setMessage(null)}
          >
            {message.text}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Personal Info Section */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: '16px' }}>
              {/* Who this is, the way a phone's account screen opens: face, name, address. */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                <AvatarEditor
                  picture={user?.picture}
                  upload={profileService.uploadPicture}
                  remove={profileService.removePicture}
                  initial={(firstName || email).charAt(0).toUpperCase() || <Person sx={{ fontSize: 40 }} />}
                  onChange={(picture) => updateCachedProfile((current) => (current ? { ...current, picture } : current))}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" noWrap sx={{ lineHeight: 1.3 }}>
                    {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || email}
                  </Typography>
                  <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
                    {email}
                  </Typography>
                </Box>
              </Box>

              <SectionHeader
                title="Personal information"
                subtitle="Your name as teammates see it in groups and labeling jobs."
              />

              <Grid container spacing={4} sx={{
                alignItems: "center"
              }}>
                <Grid size={12}>
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
            <PublicProfileCard values={publicProfile} savedHandle={user?.handle} onChange={setPublicProfile} />
          </Grid>

          <Grid size={12}>
            <PasswordCard
              hasPassword={Boolean(user?.hasPassword)}
              onChanged={() => {
                updateCachedProfile((current) => (current ? { ...current, hasPassword: true } : current));
                // A password change signs every other device out.
                queryClient.invalidateQueries({ queryKey: sessionKeys.mine });
              }}
            />
          </Grid>

          <Grid size={12}>
            <AppearanceCard />
          </Grid>

          <Grid size={12}>
            <SessionsCard />
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
