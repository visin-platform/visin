import { CheckCircle, ExpandMore } from '@mui/icons-material';
import { Box, ButtonBase, CircularProgress, Collapse, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { trailSummary, type TrailEntry } from '../../utils/thinking';
import { toolLabel } from '../../utils/toolLabels';

/** The same slot whether a read is done or working, so the words line up. */
function Mark({ done }: { done: boolean }) {
  return (
    <Box aria-hidden sx={{ width: 16, height: 16, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
      {done ? (
        <CheckCircle sx={{ fontSize: 15, color: 'success.main' }} />
      ) : (
        <CircularProgress size={14} thickness={5} />
      )}
    </Box>
  );
}

/**
 * How the analyst worked, in order: what it thought, as it wrote it, and each thing it read, ticked off when done.
 * `seconds` adds how long the read in progress has taken.
 */
export function ThinkingTrail({ entries, seconds }: { entries: TrailEntry[]; seconds?: (index: number) => number }) {
  return (
    <Stack component="ol" spacing={0.75} sx={{ m: 0, p: 0, pl: 1.25, listStyle: 'none', borderLeft: 2, borderColor: 'divider' }}>
      {entries.map((entry, index) =>
        entry.kind === 'thought' ? (
          <Typography
            key={index}
            component="li"
            variant="body2"
            sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}
          >
            {entry.text}
          </Typography>
        ) : (
          <Stack key={index} component="li" direction="row" spacing={0.75} sx={{ alignItems: 'center', minHeight: 20 }}>
            <Mark done={entry.done} />
            <Typography variant="caption" sx={{ color: entry.done ? 'text.secondary' : 'text.primary' }}>
              {toolLabel(entry.tool, entry.done ? 'done' : 'doing')}
              {entry.detail && (
                // What was searched for, in plain text: so "nothing found" shows what was tried.
                <Box component="span" sx={{ color: 'text.secondary', ml: 0.75, fontStyle: 'italic' }}>
                  “{entry.detail}”
                </Box>
              )}
              {!entry.done && (seconds?.(index) ?? 0) >= 2 && (
                <Box component="span" sx={{ color: 'text.secondary', ml: 0.75 }}>
                  {seconds!(index)}s
                </Box>
              )}
            </Typography>
          </Stack>
        )
      )}
    </Stack>
  );
}

/**
 * An answer's thinking, folded above it: one quiet line that opens to the whole trail. Closed by default, so a right
 * answer reads cleanly and a doubtful one can be traced; open (`defaultOpen`) while the analyst is still working, so the
 * trail grows in view.
 */
export function ThinkingFold({
  entries,
  footer,
  defaultOpen = false,
  seconds
}: {
  entries: TrailEntry[];
  footer?: ReactNode;
  defaultOpen?: boolean;
  seconds?: (index: number) => number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (entries.length === 0) return null;
  const summary = trailSummary(entries);
  return (
    <Box sx={{ mb: 1 }}>
      <ButtonBase
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        sx={{
          gap: 0.25,
          borderRadius: 1,
          px: 0.25,
          ml: -0.25,
          typography: 'caption',
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' }
        }}
      >
        Thinking{summary && ` · ${summary}`}
        <ExpandMore sx={{ fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 0.75 }}>
          <ThinkingTrail entries={entries} seconds={seconds} />
          {footer}
        </Box>
      </Collapse>
    </Box>
  );
}
