import { Box, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import type { Run } from '../../types/chat';
import { runTrail } from '../../utils/thinking';
import { ThinkingTrail } from './ThinkingTrail';

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
 * How the analyst is working, live: each note it writes before reading (its thinking) and each thing it reads, ticked
 * off when done, with the seconds the current read has taken. Shown until the answer starts to appear, so the wait is
 * a story rather than a spinner. `activity` is the line for the moments between reads (thinking, writing).
 */
export function AnalysisSteps({ run, assistantName }: { run: Run; assistantName?: string }) {
  const steps = run.steps ?? [];
  const entries = runTrail(steps);
  const working = entries.some((entry) => entry.kind === 'read' && !entry.done);
  const now = useNow(working);
  const lead = assistantName ? `${assistantName} · ` : '';
  // The trail drops empty steps; its indices are matched back to the steps' start times.
  const started = steps.filter((step) => step.thought || step.tool).map((step) => Date.parse(step.startedAt));
  return (
    <Box role="status" aria-label="The analyst is working" sx={{ mt: 'var(--chat-message-gap, 14px)', mb: 1, maxWidth: '46rem' }}>
      <Stack spacing={0.75}>
        {entries.length > 0 && (
          <ThinkingTrail entries={entries} seconds={(index) => Math.max(0, Math.round((now - started[index]) / 1000))} />
        )}
        {!working && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
            <TypingDots />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {lead}
              {run.activity || 'Waiting for analyst…'}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
