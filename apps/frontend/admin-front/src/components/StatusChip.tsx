import { Chip, type ChipProps } from '@mui/material';

const COLORS: Record<string, ChipProps['color']> = {
  completed: 'success',
  running: 'info',
  failed: 'error',
  uncertain: 'warning',
  pending: 'warning',
  rejected: 'default',
  active: 'success',
  suspended: 'warning',
  deleted: 'default'
};

const LABELS: Record<string, string> = { screen_queued: 'queued for page', queued: 'queued' };

/** A state as a small coloured word: green for done, red for failed, amber for what needs a second look. */
export default function StatusChip({ state, detail }: { state: string; detail?: string | number }) {
  const label = LABELS[state] ?? state;
  return (
    <Chip
      size="small"
      variant="outlined"
      color={COLORS[state] ?? 'default'}
      label={detail === undefined ? label : `${label} (${detail})`}
      sx={{ textTransform: 'capitalize' }}
    />
  );
}
