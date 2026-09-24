import type { ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import { raisedShadow } from '../../theme';

export interface PanelProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
  /** The element to render, e.g. `section` or `ul`. */
  component?: React.ElementType;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * The surface lists, tables and forms sit on: paper, a hairline border, 16px
 * corners and a shadow soft enough that a stack of them does not read as
 * clutter on a phone. Solid, not glass: blur behind rows of numbers costs
 * legibility.
 */
export function Panel({ children, sx, component = 'div', ...aria }: PanelProps) {
  return (
    <Box
      component={component}
      {...aria}
      sx={[
        {
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '16px',
          boxShadow: raisedShadow,
          overflow: 'hidden'
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {children}
    </Box>
  );
}
