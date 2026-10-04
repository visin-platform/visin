import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import type { EvidenceLevel } from '../../types/evaluation';
import { EVIDENCE_META } from './verdict';

/** How much the evaluator reported about the run: observed, attested by a manager, or none. Always the submitter's word. */
const EvidenceChip: React.FC<{ level: EvidenceLevel | undefined }> = ({ level }) => {
  const meta = EVIDENCE_META[level ?? 'none'];
  return (
    <Tooltip title={meta.meaning}>
      <Chip size="small" variant="outlined" color={level === 'attested' ? 'warning' : 'default'} label={meta.label} />
    </Tooltip>
  );
};

export default EvidenceChip;
