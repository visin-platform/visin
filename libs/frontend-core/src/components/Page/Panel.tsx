import type { ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';

export interface PanelProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
  /** The element to render, e.g. `section` or `ul`. */
  component?: React.ElementType;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * The surface lists, tables and forms sit on: white, a hairline border, 16px
 * corners. Flat on purpose — on a phone, stacked shadows read as clutter.
 */
export function Panel({ children, sx, component = 'div', ...aria }: PanelProps) {
  return (
    <Box
      component={component}
      {...aria}
      sx={[
        { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '16px', overflow: 'hidden' },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {children}
    </Box>
  );
}
