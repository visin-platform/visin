import { CheckCircle } from '@mui/icons-material';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import type { Run } from '../../types/chat';
import { toolLabel } from '../../utils/toolLabels';

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

/** The same slot whether a step is done or working, so the words line up. */
function Mark({ done }: { done: boolean }) {
  return (
    <Box aria-hidden sx={{ width: 16, height: 16, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
      {done ? <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} /> : <CircularProgress size={16} thickness={5} />}
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
 * What the analyst is doing, step by step, while it works: each thing it reads, ticked off when it is done, with the
 * seconds the current one has taken. Shown until the answer starts to appear, so the wait is a story rather than a
 * spinner. `activity` is the line for the moments between steps (thinking, writing).
 */
export function AnalysisSteps({ run, assistantName }: { run: Run; assistantName?: string }) {
  const steps = run.steps ?? [];
  const working = steps.some((step) => !step.endedAt);
  const now = useNow(working);
  const lead = assistantName ? `${assistantName} · ` : '';
  return (
    <Box role="status" aria-label="The analyst is working" sx={{ mb: 1 }}>
      <Stack spacing={0.5}>
        {steps.map((step, index) => {
          const done = Boolean(step.endedAt);
          const seconds = Math.max(0, Math.round((now - Date.parse(step.startedAt)) / 1000));
          return (
            <Stack key={`${step.tool}-${index}`} direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
              <Mark done={done} />
              <Typography variant="body2" sx={{ color: done ? 'text.secondary' : 'text.primary' }}>
                {toolLabel(step.tool, done ? 'done' : 'doing')}
                {!done && seconds >= 2 && (
                  <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.75 }}>
                    {seconds}s
                  </Typography>
                )}
              </Typography>
            </Stack>
          );
        })}
        {!working && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
            <TypingDots />
            <Typography variant="body2">
              {lead}
              {run.activity || 'Waiting for analyst…'}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
