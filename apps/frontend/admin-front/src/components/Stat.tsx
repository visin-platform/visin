import type { ReactNode } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';

/**
 * One figure with its caption, and, given a ceiling, how much of it is used: a bar that turns amber near the limit
 * and red at it. `value` and `of` are in the same unit.
 */
export default function Stat({
  label,
  children,
  detail,
  value,
  of
}: {
  label: string;
  children: ReactNode;
  detail?: ReactNode;
  value?: number;
  of?: number;
}) {
  const share = of && of > 0 && value !== undefined ? Math.min(1, value / of) : undefined;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.04em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums' }}>
        {children}
      </Typography>
      {share !== undefined && (
        <LinearProgress
          variant="determinate"
          value={share * 100}
          color={share >= 1 ? 'error' : share >= 0.8 ? 'warning' : 'primary'}
          aria-label={`${label} used`}
          sx={{ height: 6, borderRadius: 3, my: 0.75 }}
        />
      )}
      {detail && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}
