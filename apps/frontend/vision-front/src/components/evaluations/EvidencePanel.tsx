import React from 'react';
import { Alert, Box, Paper, Typography } from '@mui/material';
import type { Evaluation } from '../../types/evaluation';
import { formatDateTime } from '../../utils/dateUtils';
import { describeData } from './sources';
import { checkpointLabel } from './verdict';

/** What the evaluator reported about the run, or the claim a manager made when promoting it. Never called verified. */
const EvidencePanel: React.FC<{ evaluation: Evaluation }> = ({ evaluation }) => {
  const { evidence } = evaluation;
  if (!evidence) {
    return (
      <Alert severity="info">
        No evidence about the data, protocol or evaluator was sent with this result, so it is ranked on the submitter’s word. Sending it marks the
        result observed.
      </Alert>
    );
  }
  const rows: [string, string][] =
    evidence.kind === 'attested'
      ? [
          ['Promoted', `${formatDateTime(evidence.at)} by a project manager, from evaluation ${evidence.evaluationId}`],
          ['Checkpoint claimed', checkpointLabel(evidence.claims.checkpoint)],
          ['Sample counts claimed', Object.entries(evidence.claims.sampleCounts ?? {}).map(([name, count]) => `${name} ${count}`).join(' · ') || 'none']
        ]
      : [
          ...(evidence.data ? [['Data scored', describeData(evidence.data, { full: true })] as [string, string]] : []),
          ...(evidence.protocolDigest ? [['Protocol digest', evidence.protocolDigest] as [string, string]] : []),
          ...(evidence.evaluator ? [['Evaluator', `${evidence.evaluator.package} ${evidence.evaluator.version}`] as [string, string]] : []),
          ...(evidence.classes ? [['Classes scored', evidence.classes.scored.join(', ') || 'none'] as [string, string], ['Classes ignored', evidence.classes.ignored.join(', ') || 'none'] as [string, string]] : [])
        ];
  return (
    <>
      <Alert severity="info" sx={{ mb: 1 }}>
        {evidence.kind === 'attested'
          ? 'Nothing was observed for this result. A project manager supplied the checkpoint and sample counts when promoting an older result.'
          : 'Sent by the evaluator and compared with the suite; what is missing keeps the result at reported. Visin has not verified it.'}
      </Alert>
      <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
        <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, gap: 1, m: 0 }}>
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
            </React.Fragment>
          ))}
        </Box>
      </Paper>
    </>
  );
};

export default EvidencePanel;
