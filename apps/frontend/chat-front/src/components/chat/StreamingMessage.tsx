import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Markdown, livePalette } from '@visin/frontend-core';
import { memo, useEffect } from 'react';
import { useSmoothText } from '../../hooks/useSmoothText';
import type { RunStep } from '../../types/chat';
import { runTrail } from '../../utils/thinking';
import { ThinkingFold } from './ThinkingTrail';
import { bubbleText, bubbleWidth } from './bubbleStyle';
import { SenderLine } from './SenderLine';

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
  steps,
  onGrow
}: {
  text: string;
  /** How the run got here: folded above the answer, as it will be on the finished one. */
  steps?: RunStep[];
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
  return (
    <Box
      aria-live="off"
      aria-busy="true"
      data-testid="streaming-message"
      sx={{ mt: 'var(--chat-message-gap, 14px)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
    >
      <SenderLine name={name} profile={profile} />
      <Box
        sx={(theme) => ({
          ...bubbleWidth(true),
          minWidth: 0,
          px: 1.5,
          py: 1,
          borderRadius: '18px',
          borderTopLeftRadius: '18px',
          borderBottomLeftRadius: '6px',
          border: 1,
          borderColor: 'divider',
          bgcolor: `var(--chat-message-bg, ${livePalette(theme).background.paper})`,
          color: 'text.primary',
          overflowWrap: 'anywhere',
          ...bubbleText,
          // The caret is the end of the last line of text, not a line of its own.
          '& > :last-child > :last-child::after': {
            content: '""',
            display: 'inline-block',
            width: '0.5em',
            height: '1em',
            ml: '0.25em',
            verticalAlign: 'text-bottom',
            borderRadius: 0.5,
            backgroundColor: 'var(--chat-accent)',
            animation: `${blink} 1s steps(1) infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
          }
        })}
      >
        <ThinkingFold entries={runTrail(steps)} />
        <Markdown>{shown}</Markdown>
      </Box>
    </Box>
  );
});
