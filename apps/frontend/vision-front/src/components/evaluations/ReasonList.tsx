import React from 'react';
import { Alert, Link, List, ListItem, ListItemText } from '@mui/material';
import type { ValidationReport } from '../../types/evaluation';
import { docsUrl, ELIGIBILITY_GUIDE } from '../../utils/docsLinks';
import { reasonText, STATE_META } from './verdict';

/** Why a result is, or is not, ranked, as sentences. Warnings follow, since they change nothing. */
const ReasonList: React.FC<{ validation: ValidationReport }> = ({ validation }) => {
  const meta = STATE_META[validation.state];
  // Only a result that is not ranked has something to fix, and only a configured docs site can say how.
  const guide = validation.state !== 'eligible' && validation.reasons.length > 0 ? docsUrl(ELIGIBILITY_GUIDE) : undefined;
  return (
    <>
      <Alert severity={meta.color === 'default' ? 'info' : meta.color}>
        <strong>{meta.label}.</strong> {meta.meaning}
      </Alert>
      {validation.reasons.length > 0 && (
        <List dense aria-label="Reasons">
          {validation.reasons.map((reason, index) => (
            <ListItem key={`${reason.code}-${reason.detail ?? ''}-${index}`}>
              <ListItemText primary={reasonText(reason)} secondary={reason.code} />
            </ListItem>
          ))}
        </List>
      )}
      {guide && (
        <Link href={guide} target="_blank" rel="noopener noreferrer" variant="body2">
          Why is my result unranked? Every reason, and how to fix it
        </Link>
      )}
      {validation.warnings.length > 0 && (
        <List dense aria-label="Warnings">
          {validation.warnings.map((warning, index) => (
            <ListItem key={`${warning.code}-${warning.detail ?? ''}-${index}`}>
              <ListItemText primary={reasonText(warning)} secondary={`Warning · ${warning.code}`} />
            </ListItem>
          ))}
        </List>
      )}
    </>
  );
};

export default ReasonList;
