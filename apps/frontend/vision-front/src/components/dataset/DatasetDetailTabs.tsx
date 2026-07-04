import React from 'react';
import { Tab, Tabs } from '@mui/material';

interface DatasetDetailTabsProps {
  value: number;
  onChange: (event: React.SyntheticEvent, newValue: number) => void;
}

const DatasetDetailTabs: React.FC<DatasetDetailTabsProps> = ({ value, onChange }) => (
  <Tabs
    value={value}
    onChange={onChange}
    variant="scrollable"
    scrollButtons="auto"
    allowScrollButtonsMobile
    sx={{
      borderBottom: 1,
      borderColor: 'divider',
      '& .MuiTab-root': {
        fontWeight: 500,
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
    }}
  >
    <Tab label="Description" />
    <Tab label="Categories" />
    <Tab label="Images" />
    <Tab label="Export" />
  </Tabs>
);

export default DatasetDetailTabs;
