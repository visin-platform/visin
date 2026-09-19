import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

export interface SectionHeadingProps {
  id?: string;
  children: ReactNode;
  /** Beside the caption, e.g. a "See all" link. */
  action?: ReactNode;
}

/** The small caption over a group of rows, the way a phone's settings screens caption theirs. */
export function SectionHeading({ id, children, action }: SectionHeadingProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, px: 0.5, mb: 1 }}>
      <Typography
        id={id}
        component="h2"
        sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}
      >
        {children}
      </Typography>
      {action}
    </Box>
  );
}
