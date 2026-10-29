import React from 'react';
import { Tabs, type TabsProps } from '@mui/material';

interface ScrollableTabsProps extends Omit<TabsProps, 'variant' | 'scrollButtons' | 'allowScrollButtonsMobile'> {
  /** Weight of the tab labels. */
  fontWeight?: number;
}

/** The app's tab bar: scrolls sideways on a narrow screen, with no visible scrollbar. */
const ScrollableTabs: React.FC<ScrollableTabsProps> = ({ fontWeight = 500, sx, ...props }) => (
  <Tabs
    variant="scrollable"
    scrollButtons="auto"
    allowScrollButtonsMobile
    sx={[
      {
        '& .MuiTab-root': {
          textTransform: 'none',
          fontWeight,
          minHeight: 48,
          px: { xs: 2, sm: 3 },
          minWidth: { xs: 'auto', sm: 90 },
          flexShrink: 0
        },
        '& .MuiTabs-scrollButtons': {
          display: { xs: 'flex', sm: 'auto' }
        },
        '& .MuiTabs-scroller': {
          overflow: 'auto !important',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }
      },
      ...(Array.isArray(sx) ? sx : [sx])
    ]}
    {...props}
  />
);

export default ScrollableTabs;
