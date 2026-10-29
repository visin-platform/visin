import React from 'react';
import ScrollableTabs from '../common/ScrollableTabs';
import { Paper, Tab } from '@mui/material';
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
    <ScrollableTabs
      value={value}
      onChange={onChange}
      fontWeight={600}
      sx={{ borderBottom: 1, borderColor: 'divider' }}
    >
      {TRAINING_TABS.filter(([name]) => showModels || name !== 'models').map(([name, label]) => (
        <Tab key={name} value={name} label={label} />
      ))}
    </ScrollableTabs>
  </Paper>
);

export default TrainingDetailTabs;
