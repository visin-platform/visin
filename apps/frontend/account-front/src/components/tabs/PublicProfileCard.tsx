import React from 'react';
import { Box, FormControlLabel, Link, Paper, Switch, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { MAX_BIO, MAX_LINKS, parseLinks, type PublicProfileValues } from './publicProfile';

interface PublicProfileCardProps {
  values: PublicProfileValues;
  /** The handle as saved: the page that exists now, which a typed one does not move until saved. */
  savedHandle?: string;
  onChange: (values: PublicProfileValues) => void;
}

/**
 * What strangers see of this account: the page at `/u/{handle}`, and the name and picture
 * beside what the account owns. Saved with the rest of the profile.
 */
const PublicProfileCard: React.FC<PublicProfileCardProps> = ({ values, savedHandle, onChange }) => {
  const set = <K extends keyof PublicProfileValues>(key: K, value: PublicProfileValues[K]) => onChange({ ...values, [key]: value });
  const links = parseLinks(values.linksText);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: '16px' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          Public profile
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          What anyone can see, signed in or not: your name, handle and what you write here, beside the projects and
          datasets you make public. Your email is never shown.
          {savedHandle && values.profilePublic && (
            <>
              {' '}
              <Link component={RouterLink} to={`/u/${savedHandle}`}>
                View your page
              </Link>
            </>
          )}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Handle"
          value={values.handle}
          onChange={(event) => set('handle', event.target.value.toLowerCase())}
          slotProps={{ htmlInput: { maxLength: 30, autoCapitalize: 'none', spellCheck: false } }}
          helperText={`Your page is /u/${values.handle || 'handle'}. 3 to 30 lowercase letters, digits or hyphens. Changing it breaks links to the old one.`}
        />
        <TextField
          fullWidth
          size="small"
          label="Bio"
          multiline
          minRows={2}
          value={values.bio}
          onChange={(event) => set('bio', event.target.value)}
          slotProps={{ htmlInput: { maxLength: MAX_BIO } }}
          helperText={`${values.bio.length}/${MAX_BIO}`}
        />
        <TextField
          fullWidth
          size="small"
          label="Links"
          multiline
          minRows={2}
          value={values.linksText}
          onChange={(event) => set('linksText', event.target.value)}
          error={links.length > MAX_LINKS}
          helperText={
            links.length > MAX_LINKS
              ? `At most ${MAX_LINKS} links.`
              : `One address per line, starting with https:// (up to ${MAX_LINKS}).`
          }
        />
        <FormControlLabel
          control={<Switch checked={values.profilePublic} onChange={(event) => set('profilePublic', event.target.checked)} />}
          label="Show my public page"
        />
        {!values.profilePublic && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1 }}>
            Hidden: your page is gone, and what you own shows no name or picture. The projects and datasets you made
            public stay public.
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default PublicProfileCard;
