import React from 'react';
import { FormControlLabel, Switch, Tooltip } from '@mui/material';

/**
 * Rank only the results whose evaluator sent complete evidence that matched the suite. Off by default: every
 * result with a checkpoint, counts and scores is ranked, labelled as observed, reported or attested.
 */
const ObservedSwitch: React.FC<{ checked: boolean; onChange: (on: boolean) => void }> = ({ checked, onChange }) => (
  <Tooltip describeChild title="Leaves out results that sent little or no evidence about their data, protocol or evaluator, and promoted ones. Ranks are then among the observed results alone.">
    <FormControlLabel
      control={<Switch size="small" checked={checked} onChange={(_event, on) => onChange(on)} />}
      label="Observed evidence only"
    />
  </Tooltip>
);

export default ObservedSwitch;
