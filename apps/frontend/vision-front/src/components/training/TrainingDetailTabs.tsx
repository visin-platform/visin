import React from 'react';
import { Paper, Tab, Tabs } from '@mui/material';

interface TrainingDetailTabsProps {
  value: number;
  onChange: (event: React.SyntheticEvent, newValue: number) => void;
}

const TrainingDetailTabs: React.FC<TrainingDetailTabsProps> = ({ value, onChange }) => (
  <Paper
    elevation={0}
    variant="outlined"
    sx={{
      mb: 3,
      borderRadius: 2,
      overflow: 'hidden',
      bgcolor: 'background.paper'
    }}
  >
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
          textTransform: 'none',
          fontWeight: 600,
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
      <Tab label="Overview" />
      <Tab label="Epochs" />
      <Tab label="Test Results" />
      <Tab label="Visualizations" />
      <Tab label="System Info" />
      <Tab label="Config" />
      <Tab label="Benchmarks" />
    </Tabs>
  </Paper>
);

export default TrainingDetailTabs;
