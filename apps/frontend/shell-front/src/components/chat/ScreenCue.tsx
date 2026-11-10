import { AutoAwesome, Close } from '@mui/icons-material';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { glass, livePalette, tint } from '@visin/frontend-core';
import { useEffect } from 'react';
import { useChatDock } from './chatDock';

/** How long the note stays before it goes by itself: long enough to read, and to take back. */
const CUE_MS = 8000;

const pulse = keyframes`
  0% { opacity: 0.9; }
  100% { opacity: 0; }
`;

/**
 * When the analyst changes the page beside the chat, the page just changes: nothing says who did it. This says so: a
 * brief glow around the page, and a note ("Analyst opened the run's Epochs tab") with a way back. It is a floating
 * surface, so it is frosted; and where motion is reduced there is no glow, only the note.
 */
export function ScreenCue() {
  const { screenCue, dismissScreenCue, undoScreenCue } = useChatDock();
  const id = screenCue?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => dismissScreenCue?.(), CUE_MS);
    return () => clearTimeout(timer);
  }, [id, dismissScreenCue]);

  if (!screenCue) return null;
  return (
    <>
      {/* Keyed by the cue: the same kind of change twice glows twice. */}
      <Box
        key={`glow-${screenCue.id}`}
        aria-hidden
        data-testid="screen-glow"
        sx={(theme) => ({
          position: 'fixed',
          inset: 0,
          zIndex: theme.zIndex.modal - 1,
          pointerEvents: 'none',
          boxShadow: `inset 0 0 0 2px ${livePalette(theme).primary.main}, inset 0 0 48px ${tint(livePalette(theme).primary.main, 0.4)}`,
          animation: `${pulse} 1400ms ease-out forwards`,
          '@media (prefers-reduced-motion: reduce)': { display: 'none' }
        })}
      />
      <Box
        key={`note-${screenCue.id}`}
        role="status"
        aria-live="polite"
        sx={(theme) => ({
          ...glass,
          position: 'fixed',
          zIndex: theme.zIndex.snackbar,
          left: { xs: 16, md: 96 },
          bottom: { xs: 80, md: 24 },
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 1.5,
          pr: 0.5,
          py: 0.5,
          borderRadius: 999
        })}
      >
        <AutoAwesome fontSize="small" sx={{ color: 'primary.main' }} aria-hidden />
        <Typography variant="body2" sx={{ minWidth: 0 }}>
          Analyst opened {screenCue.what}
        </Typography>
        {screenCue.undoTo && (
          <Button size="small" onClick={() => undoScreenCue?.()}>
            Undo
          </Button>
        )}
        <IconButton size="small" aria-label="Dismiss" onClick={() => dismissScreenCue?.()}>
          <Close fontSize="small" />
        </IconButton>
      </Box>
    </>
  );
}
