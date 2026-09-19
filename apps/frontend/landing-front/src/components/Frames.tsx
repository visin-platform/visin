import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/** Placement from the caller (position, width…), merged over the frame's own look. */
type FrameSx = Record<string, unknown>;

/**
 * A plain browser window around a real screen of the app: three dots and a
 * bar, no address — the page must never show a real deployment's domain.
 */
export function BrowserFrame({ children, sx }: { children: ReactNode; sx?: FrameSx }) {
  return (
    <Box
      sx={{
        borderRadius: '14px',
        overflow: 'hidden',
        bgcolor: '#0B1220',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 30px 80px rgba(2, 6, 23, 0.55)',
        ...sx
      }}
    >
      <Box aria-hidden sx={{ display: 'flex', gap: 0.75, px: 1.5, py: 1.1, bgcolor: '#1F2937' }}>
        {['#F87171', '#FBBF24', '#34D399'].map((color) => (
          <Box key={color} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, opacity: 0.85 }} />
        ))}
      </Box>
      <Box sx={{ lineHeight: 0 }}>{children}</Box>
    </Box>
  );
}

/** A phone around a screenshot of the installed app. */
export function PhoneFrame({ src, alt, sx }: { src: string; alt: string; sx?: FrameSx }) {
  return (
    <Box
      sx={{
        p: '7px',
        borderRadius: '30px',
        bgcolor: '#0B1220',
        border: '1px solid rgba(255,255,255,0.14)',
        boxShadow: '0 24px 60px rgba(2, 6, 23, 0.45)',
        ...sx
      }}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        loading="lazy"
        sx={{ display: 'block', width: '100%', aspectRatio: '600 / 1221', borderRadius: '24px', objectFit: 'cover' }}
      />
    </Box>
  );
}
