import { useState } from 'react';
import { Box, Button, IconButton, Typography, useTheme } from '@mui/material';
import { Close } from '@mui/icons-material';
import { livePalette, tint } from '@visin/frontend-core';

const DISMISSED_KEY = 'visin-explore-welcome';

// Per-browser convenience only: it can be blocked or empty, and the banner just shows again.
const wasDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};
const remember = (): void => {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    /* shown again next visit */
  }
};

interface VisitorBannerProps {
  onSignup: () => void;
  /** The landing site's About page; unset, there is nothing to link to. */
  aboutUrl?: string;
}

/** One line of context for someone who arrived without an account, then out of the way. */
export function VisitorBanner({ onSignup, aboutUrl }: VisitorBannerProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(() => !wasDismissed());
  if (!open) {
    return null;
  }

  return (
    <Box
      role="region"
      aria-label="About Visin"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
        py: 1.25,
        pl: 2,
        pr: 1,
        borderRadius: '16px',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: tint(livePalette(theme).primary.main, 0.08)
      }}
    >
      <Typography sx={{ flex: '1 1 320px', minWidth: 0 }}>
        <strong>Visin</strong> is an open-source platform for computer-vision experiments. Browse what people
        publish, or run your own.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button variant="contained" size="small" onClick={onSignup}>
          Sign up
        </Button>
        {aboutUrl && (
          <Button size="small" href={aboutUrl}>
            About
          </Button>
        )}
        <IconButton
          size="small"
          aria-label="Dismiss"
          onClick={() => {
            remember();
            setOpen(false);
          }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}
