import { Box, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { Markdown, livePalette } from '@visin/frontend-core';
import { memo, useEffect, useState } from 'react';
import { useSmoothText } from '../../hooks/useSmoothText';
import type { Run } from '../../types/chat';
import { runTrail, type TrailEntry } from '../../utils/thinking';
import { ThinkingFold } from './ThinkingTrail';
import { bubbleText, bubbleWidth } from './bubbleStyle';
import { SenderLine } from './SenderLine';

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-3px); opacity: 1; }
`;

/** Three dots in turn: the analyst is thinking or writing, with nothing in particular to say yet. */
function TypingDots() {
  return (
    <Box aria-hidden sx={{ display: 'inline-flex', gap: '3px', alignItems: 'center', height: 16, width: 16 }}>
      {[0, 1, 2].map((dot) => (
        <Box
          key={dot}
          sx={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            bgcolor: 'text.secondary',
            animation: `${bounce} 1.2s ease-in-out ${dot * 0.15}s infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.7 }
          }}
        />
      ))}
    </Box>
  );
}

/** Ticks once a second while `active`, for a count of seconds that moves. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * The text being written now, as it should be shown under the trail. What the analyst writes before it reads is a note:
 * the draft is cleared and the note joins the trail, in two writes the stream can see apart. So the last text is kept
 * until the trail grows, and text the trail already ends with is not shown twice.
 */
function useWriting(text: string, entries: TrailEntry[]): string {
  const size = entries.length;
  const [kept, setKept] = useState({ text, size });
  if (text ? text !== kept.text || size !== kept.size : kept.text && size !== kept.size) setKept({ text, size });
  const writing = text || (size === kept.size ? kept.text : '');
  const last = entries[size - 1];
  return last?.kind === 'thought' && last.text && writing.trim().startsWith(last.text) ? '' : writing;
}

/**
 * The analyst's answer while it is still being worked on, from the moment it is asked until it is a message: the same
 * bubble the finished answer will have. Its thinking is open above, and grows as notes and reads arrive; the text being
 * written is typed out under it, with a caret at its end, and a note joins the trail where it was typed. Nothing in it
 * is redrawn as the work goes on: it only grows. It has no actions (nothing to copy or save yet), and the text is not
 * announced word by word: what the analyst is doing is, and the finished message is.
 */
export const StreamingMessage = memo(function StreamingMessage({
  text,
  name,
  profile,
  run,
  onGrow
}: {
  /** The answer (or note) as written so far; empty while the analyst reads or waits. */
  text: string;
  /** The run being worked on: its steps make the trail, and its activity says what it is doing between them. */
  run?: Pick<Run, 'steps' | 'activity'>;
  name: string;
  profile?: { handle: string; picture?: string };
  /** Called as the bubble gets taller, so a reader at the end of the thread stays there. */
  onGrow?: () => void;
}) {
  const steps = run?.steps ?? [];
  const entries = runTrail(steps);
  const reading = entries.some((entry) => entry.kind === 'read' && !entry.done);
  const now = useNow(reading);
  // The trail drops empty steps; its indices are matched back to the steps' start times.
  const started = steps.filter((step) => step.thought || step.tool).map((step) => Date.parse(step.startedAt));
  const shown = useSmoothText(useWriting(text, entries));
  // The text is typed out after it arrives, so the thread has to follow what is on screen, not what was received.
  useEffect(() => {
    onGrow?.();
  }, [shown, entries.length, onGrow]);
  return (
    <Box
      aria-live="off"
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
          ...(shown && {
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
          })
        })}
      >
        <Box role="status" aria-label="The analyst is working">
          <ThinkingFold
            entries={entries}
            defaultOpen
            seconds={(index) => Math.max(0, Math.round((now - started[index]) / 1000))}
          />
          {!shown && !reading && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
              <TypingDots />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {run?.activity || 'Waiting for analyst…'}
              </Typography>
            </Stack>
          )}
        </Box>
        {shown && <Markdown>{shown}</Markdown>}
      </Box>
    </Box>
  );
});
