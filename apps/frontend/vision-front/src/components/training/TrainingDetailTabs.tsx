import React from 'react';
import { Paper, Tab, Tabs } from '@mui/material';
import { TRAINING_TABS, type TrainingTab } from './trainingTabs';

interface TrainingDetailTabsProps {
  value: TrainingTab;
  onChange: (event: React.SyntheticEvent, newValue: TrainingTab) => void;
  /** whether the run keeps a model on Visin; the Models tab is left out when it keeps none */
  showModels?: boolean;
}

const TrainingDetailTabs: React.FC<TrainingDetailTabsProps> = ({ value, onChange, showModels = false }) => (
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
      {TRAINING_TABS.filter(([name]) => showModels || name !== 'models').map(([name, label]) => (
        <Tab key={name} value={name} label={label} />
      ))}
    </Tabs>
  </Paper>
);

export default TrainingDetailTabs;
