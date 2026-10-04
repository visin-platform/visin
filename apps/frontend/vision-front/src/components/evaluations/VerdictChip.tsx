import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import type { ValidationReport } from '../../types/evaluation';
import { reasonText, STATE_META } from './verdict';

/** The verdict of an evaluation: whether it can be ranked, with the reasons behind it on hover. */
const VerdictChip: React.FC<{ validation: ValidationReport }> = ({ validation }) => {
  const meta = STATE_META[validation.state];
  const why = validation.reasons.length > 0 ? validation.reasons.map(reasonText).join(' ') : meta.meaning;
  return (
    <Tooltip title={why}>
      <Chip size="small" label={meta.label} color={meta.color} variant={meta.color === 'default' ? 'outlined' : 'filled'} />
    </Tooltip>
  );
};

export default VerdictChip;
