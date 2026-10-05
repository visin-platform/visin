import { ShareButton } from '@visin/frontend-core';
import { Link as RouterLink } from 'react-router-dom';
import { Avatar, Box, Button, Link, Typography } from '@mui/material';
import { Edit } from '@mui/icons-material';
import { panelSx } from '../home/panel';
import { describeLink } from './socialLinks';

interface ProfileHeaderProps {
  name: string;
  handle: string;
  picture?: string;
  bio?: string;
  links?: string[];
  /** The line under it all: when they joined, when it was made. */
  meta: string;
  shareUrl?: string;
  /** A way to edit it, shown to whoever owns it. */
  edit?: { to: string };
}

/** Who a public page is about, as its owner wrote it. A person's, and a group's, look the same. */
export function ProfileHeader({ name, handle, picture, bio, links = [], meta, edit, shareUrl }: ProfileHeaderProps) {
  return (
    <Box
      sx={{
        ...panelSx,
        display: 'flex',
        gap: { xs: 2, sm: 3 },
        p: { xs: 2, sm: 3 },
        flexWrap: 'wrap',
        alignItems: 'flex-start'
      }}
    >
      <Avatar
        src={picture}
        alt=""
        slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
        sx={{ width: { xs: 64, sm: 96 }, height: { xs: 64, sm: 96 }, fontSize: '2rem', bgcolor: 'secondary.main' }}
      >
        {name.charAt(0).toUpperCase()}
      </Avatar>
      <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontSize: { xs: '1.5rem', sm: '1.9rem' }, fontWeight: 800, overflowWrap: 'anywhere' }}
        >
          {name}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>@{handle}</Typography>
        {bio && <Typography sx={{ mt: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{bio}</Typography>}
        {links.length > 0 && (
          <Box
            component="ul"
            aria-label="Links"
            sx={{ listStyle: 'none', m: 0, mt: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2 }}
          >
            {links.map((url) => {
              const { label, detail, icon } = describeLink(url);
              return (
                <li key={url}>
                  {/* Written by the person and shown to strangers: no referrer, and no endorsement. */}
                  <Link
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, overflowWrap: 'anywhere' }}
                  >
                    {icon}
                    <span>{label}</span>
                    {detail && (
                      <>
                        {/* A space for a screen reader: the flex layout draws none. */}{' '}
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                          {detail}
                        </Box>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
          {meta}
        </Typography>
      </Box>
      <ShareButton url={shareUrl} />
      {edit && (
        <Button component={RouterLink} to={edit.to} variant="outlined" size="small" startIcon={<Edit />}>
          Edit profile
        </Button>
      )}
    </Box>
  );
}
