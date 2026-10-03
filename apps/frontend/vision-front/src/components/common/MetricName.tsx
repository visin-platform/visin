import React from 'react';
import { Box, Tooltip } from '@mui/material';

interface MetricNameProps {
  label: React.ReactNode;
  /** what the metric means; with none, the label is shown as plain text */
  description?: string;
}

/**
 * A metric's name that explains itself on hover or keyboard focus. The definition
 * comes from `ResolvedMetric.description`: the project's own wording, else the
 * built-in glossary. The dotted underline is the only hint that there is more to
 * read, so a name with no definition carries none.
 */
const MetricName: React.FC<MetricNameProps> = ({ label, description }) => {
  if (!description) return <>{label}</>;
  return (
    <Tooltip title={description} describeChild arrow enterTouchDelay={0}>
      <Box
        component="span"
        tabIndex={0}
        sx={{ textDecoration: 'underline dotted', textUnderlineOffset: 3, cursor: 'help' }}
      >
        {label}
      </Box>
    </Tooltip>
  );
};

export default MetricName;
