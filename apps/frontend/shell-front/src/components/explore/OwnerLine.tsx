import { Link as RouterLink } from 'react-router-dom';
import { Avatar, Box, Link, Typography } from '@mui/material';
import type { ExploreOwner } from '../../services/exploreApi';

/**
 * Who something belongs to: the owner's avatar and name, and for a person with a public page
 * the name opens it. Nothing at all where the owner is not shown (a person who hid their
 * profile, a group the viewer is not in), so a card never says "unknown".
 *
 * Sits above its card's stretched link (`position: relative`), so it is its own link rather
 * than a link inside one.
 */
export function OwnerLine({ owner }: { owner: ExploreOwner }) {
  if (!owner.name) {
    return null;
  }

  const body = (
    <>
      <Avatar
        src={owner.picture}
        alt=""
        slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
        sx={{ width: 20, height: 20, fontSize: '0.7rem', bgcolor: 'secondary.main' }}
      >
        {owner.name.charAt(0).toUpperCase()}
      </Avatar>
      <Typography variant="caption" noWrap sx={{ color: 'inherit', minWidth: 0 }}>
        {owner.name}
      </Typography>
    </>
  );
  const sx = { position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0, maxWidth: '100%' } as const;

  if (owner.kind === 'user' && owner.handle) {
    return (
      <Link
        component={RouterLink}
        to={`/u/${owner.handle}`}
        underline="hover"
        aria-label={`${owner.name}, profile`}
        sx={{ ...sx, color: 'text.secondary', alignSelf: 'flex-start', '&:hover': { color: 'primary.main' } }}
      >
        {body}
      </Link>
    );
  }
  return (
    <Box sx={{ ...sx, color: 'text.secondary', alignSelf: 'flex-start' }}>
      {body}
    </Box>
  );
}
