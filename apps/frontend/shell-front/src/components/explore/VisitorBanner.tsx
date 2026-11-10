import { Link as RouterLink } from 'react-router-dom';
import { CountValue } from '../home/ActivityTrend';
import { formatCount } from '../home/formatting';
import type { ExploreDataset } from '../../services/exploreApi';
import type { CatalogueFigure } from './catalogueFigures';
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
  expanded?: boolean;
  figures?: CatalogueFigure[];
  preview?: ExploreDataset;
  onExplore?: () => void;
  /** The landing site's About page; unset, there is nothing to link to. */
  aboutUrl?: string;
}

/** One line of context for someone who arrived without an account, then out of the way. */
export function VisitorBanner({
  onSignup,
  aboutUrl,
  expanded = false,
  figures = [],
  preview,
  onExplore
}: VisitorBannerProps) {
  const theme = useTheme();
  const [failedImage, setFailedImage] = useState<string>();
  const [open, setOpen] = useState(() => !wasDismissed());
  if (!open) {
    return null;
  }

  if (expanded)
    return (
      <Box
        component="section"
        role="region"
        aria-label="About Visin"
        sx={{
          position: 'relative',
          border: 1,
          borderColor: 'divider',
          borderRadius: '24px',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.2fr) minmax(0, 1fr)' }
        }}
      >
        <IconButton
          aria-label="Dismiss"
          size="small"
          onClick={() => {
            remember();
            setOpen(false);
          }}
          sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1, bgcolor: 'background.paper' }}
        >
          <Close fontSize="small" />
        </IconButton>
        <Box sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '.12em' }}>
            Visin · open research
          </Typography>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 30, sm: 38, xl: 44 },
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-.035em',
              maxWidth: 560
            }}
          >
            Explore computer vision in action.
          </Typography>
          <Typography sx={{ color: 'text.secondary', maxWidth: 520 }}>
            Open experiments, inspect model outputs, and follow the findings. Browse the evidence without an account.
          </Typography>
          {figures.length > 0 && (
            <Box
              component="dl"
              aria-label="Public catalogue"
              sx={{ m: 0, display: 'flex', flexWrap: 'wrap', gap: { xs: 2, sm: 3 } }}
            >
              {figures.map((figure) => (
                <Box key={figure.label} sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>
                    {figure.label}
                  </Typography>
                  <Typography component="dd" sx={{ m: 0, fontWeight: 750, fontSize: 27, order: -1 }}>
                    <CountValue value={figure.value} />
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 'auto' }}>
            {onExplore && (
              <Button variant="contained" onClick={onExplore}>
                Explore projects
              </Button>
            )}
            {onExplore && (
              <Button component={RouterLink} to="/leaderboards">
                Leaderboards
              </Button>
            )}
            <Button variant={onExplore ? 'outlined' : 'contained'} onClick={onSignup}>
              Sign up
            </Button>
            {aboutUrl && <Button href={aboutUrl}>About</Button>}
          </Box>
        </Box>
        <Box
          sx={{
            position: 'relative',
            minHeight: { xs: 190, md: 300 },
            bgcolor: tint(livePalette(theme).primary.main, 0.08),
            display: 'grid',
            alignItems: 'center'
          }}
        >
          {preview?.coverUrl && failedImage !== preview.coverUrl ? (
            <>
              <Box
                component="img"
                src={preview.coverUrl}
                alt={`Public dataset preview: ${preview.name}`}
                fetchPriority="high"
                decoding="async"
                onError={() => setFailedImage(preview.coverUrl)}
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <Box
                sx={{
                  alignSelf: 'end',
                  position: 'relative',
                  m: 2,
                  p: 1.5,
                  borderRadius: '12px',
                  bgcolor: 'background.paper'
                }}
              >
                <Button
                  component={RouterLink}
                  to={`/datasets/${preview._id}`}
                  sx={{ p: 0, justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  Explore {preview.name}
                </Button>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  {formatCount(preview.imageCount)} images · {preview.license?.name ?? 'Licence not stated'}
                </Typography>
              </Box>
            </>
          ) : (
            <Box sx={{ p: 4 }}>
              <Typography sx={{ fontWeight: 750, fontSize: 26 }}>From experiments to evidence.</Typography>
              <Typography sx={{ color: 'text.secondary', mt: 1 }}>
                Explore the runs, checkpoints and findings that researchers have made public.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
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
        <strong>Visin</strong> is an open-source platform for computer-vision experiments. Browse what people publish,
        or run your own.
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
