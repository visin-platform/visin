import React, { useState } from 'react';
import ScrollableTabs from '../common/ScrollableTabs';
import { Menu, MenuItem, Paper, Tab } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useCompactLayout } from '@visin/frontend-core';
import { TRAINING_TABS, type TrainingTab } from './trainingTabs';

interface TrainingDetailTabsProps {
  value: TrainingTab;
  onChange: (event: React.SyntheticEvent, newValue: TrainingTab) => void;
  /** whether the run keeps a model on Visin; the Models tab is left out when it keeps none */
  showModels?: boolean;
}

/** How many tabs a phone shows; the rest are one tap further, in a menu. Nine in a sideways scroller hid six. */
const PHONE_TABS = 3;
const MORE = 'more';

const TrainingDetailTabs: React.FC<TrainingDetailTabsProps> = ({ value, onChange, showModels = false }) => {
  const compact = useCompactLayout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const tabs = TRAINING_TABS.filter(([name]) => showModels || name !== 'models');
  const shown = compact ? tabs.slice(0, PHONE_TABS) : tabs;
  const hidden = compact ? tabs.slice(PHONE_TABS) : [];
  // When the page is on a tab behind the menu, the menu's own tab carries its name, so the bar still says where it is.
  const current = hidden.find(([name]) => name === value);

  return (
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
        value={current ? MORE : value}
        onChange={(event, next: string) => {
          if (next !== MORE) onChange(event, next as TrainingTab);
        }}
        fontWeight={600}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          // Four tabs have to fit a phone's width: a scroller that hides the one that opens the rest is no menu.
          ...(compact && { '& .MuiTab-root': { px: 1.25, fontSize: '0.8125rem', minWidth: 0 } })
        }}
      >
        {shown.map(([name, label]) => (
          <Tab key={name} value={name} label={label} />
        ))}
        {hidden.length > 0 && (
          <Tab
            value={MORE}
            label={current ? current[1] : 'More'}
            icon={<ExpandMore fontSize="small" />}
            iconPosition="end"
            aria-haspopup="menu"
            aria-expanded={Boolean(anchor)}
            onClick={(event) => setAnchor(event.currentTarget)}
          />
        )}
      </ScrollableTabs>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {hidden.map(([name, label]) => (
          <MenuItem
            key={name}
            selected={name === value}
            onClick={(event) => {
              setAnchor(null);
              onChange(event, name);
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
};

export default TrainingDetailTabs;
