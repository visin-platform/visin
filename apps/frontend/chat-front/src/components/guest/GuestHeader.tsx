import { useState } from 'react';
import { Avatar, Box, IconButton, Link, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { MoreVert } from '@mui/icons-material';
import { chatChrome } from '../../appearance/chatAppearance';
import type { GuestCapabilities } from './useGuestCapabilities';

export function GuestHeader({
  assistant,
  onAppearance
}: {
  assistant?: GuestCapabilities['assistant'];
  onAppearance: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const name = assistant?.name || 'Vivi';
  const href = assistant?.handle ? `/u/${encodeURIComponent(assistant.handle)}` : undefined;
  const avatar = (
    <Avatar
      src={assistant?.picture}
      alt={name}
      slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
      sx={{ width: 40, height: 40 }}
    >
      {name.charAt(0).toUpperCase()}
    </Avatar>
  );
  return (
    <Stack
      component="header"
      role="group"
      aria-label="Conversation header"
      direction="row"
      sx={(theme) => ({
        ...chatChrome(theme),
        p: 1.5,
        gap: 1,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider'
      })}
    >
      {href ? (
        <Link href={href} aria-label={`View ${name} profile`} sx={{ borderRadius: '50%' }}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700 }}>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Public research assistant
        </Typography>
      </Box>
      <IconButton
        aria-label="Conversation settings"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVert />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onAppearance();
          }}
        >
          Appearance
        </MenuItem>
        {href && (
          <MenuItem component="a" href={href} onClick={() => setAnchor(null)}>
            View profile
          </MenuItem>
        )}
      </Menu>
    </Stack>
  );
}
