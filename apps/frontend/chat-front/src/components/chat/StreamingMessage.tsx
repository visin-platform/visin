import { Avatar, Box, Link, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Markdown } from '@visin/frontend-core';
import { memo, useEffect } from 'react';
import { useSmoothText } from '../../hooks/useSmoothText';

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

/**
 * The analyst's answer while it is still being written: the same bubble the finished answer will have, filling as the
 * text arrives, with a caret at its end. It has no actions (nothing to copy or save yet), and it is not announced to
 * screen readers word by word: the finished message is.
 */
export const StreamingMessage = memo(function StreamingMessage({
  text,
  name,
  profile,
  onGrow
}: {
  text: string;
  name: string;
  profile?: { handle: string; picture?: string };
  /** Called as the bubble gets taller, so a reader at the end of the thread stays there. */
  onGrow?: () => void;
}) {
  const shown = useSmoothText(text);
  // The text is typed out after it arrives, so the thread has to follow what is on screen, not what was received.
  useEffect(() => {
    onGrow?.();
  }, [shown, onGrow]);
  const initial = name.charAt(0);
  return (
    <Box
      aria-live="off"
      aria-busy="true"
      data-testid="streaming-message"
      sx={{ mb: 'var(--chat-message-gap, 10px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5, px: 0.5 }}>
        {profile ? (
          <Link href={`/u/${encodeURIComponent(profile.handle)}`} aria-label={`View ${name} profile`}>
            <Avatar src={profile.picture} alt="" sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
              {initial}
            </Avatar>
          </Link>
        ) : (
          <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>{initial}</Avatar>
        )}
        <Typography variant="caption" color="text.secondary">
          {name}
        </Typography>
      </Stack>
      <Box
        sx={{
          maxWidth: { xs: '92%', sm: '85%' },
          minWidth: 0,
          px: 1.5,
          py: 'var(--chat-bubble-y, 6px)',
          borderRadius: 2.5,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
          color: 'text.primary',
          overflowWrap: 'anywhere',
          '& > :first-child': { mt: 0 },
          '& > :last-child': { mb: 0 },
          // The caret is the end of the last line of text, not a line of its own.
          '& > :last-child > :last-child::after': {
            content: '""',
            display: 'inline-block',
            width: '0.5em',
            height: '1em',
            ml: '0.25em',
            verticalAlign: 'text-bottom',
            borderRadius: 0.5,
            backgroundColor: 'primary.main',
            animation: `${blink} 1s steps(1) infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
          }
        }}
      >
        <Markdown>{shown}</Markdown>
      </Box>
    </Box>
  );
});
