import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { tint } from '@visin/frontend-core';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 var(--live-ring); }
  70% { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
`;

/** A dot that pulses: this run is training now. Where motion is reduced it is a steady dot. */
export function LiveDot({ color }: { color: string }) {
  return (
    <Box
      aria-hidden
      data-testid="live-dot"
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: color,
        '--live-ring': tint(color, 0.45),
        animation: `${pulse} 1.6s ease-out infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
      }}
    />
  );
}
