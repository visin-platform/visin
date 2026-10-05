import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import type { DataLicense } from '../../types/license';

interface LicenseChipProps {
  /** undefined means the publisher has not said */
  license: DataLicense | undefined;
  /** what the licence is of, in the tooltip: "data" or "dataset" */
  of?: string;
}

/**
 * The licence a publisher declared for some data. Visin shows it and does not interpret it, and says so; when there
 * is none it says that, because silence is not permission.
 */
const LicenseChip: React.FC<LicenseChipProps> = ({ license, of = 'data' }) => {
  if (!license) {
    return (
      <Tooltip describeChild title={`The publisher has not said what this ${of} may be used for. That is not permission to use it.`}>
        <Chip size="small" variant="outlined" label="Licence not stated" />
      </Tooltip>
    );
  }
  const noncommercial = license.commercial === false;
  return (
    <Tooltip
      describeChild
      title={`${license.name}, as declared by the publisher${noncommercial ? ': no commercial use' : ''}. Visin shows it and has not checked it.`}
    >
      <Chip
        size="small"
        color={noncommercial ? 'warning' : 'default'}
        label={noncommercial ? `${license.name} · non-commercial` : license.name}
        {...(license.url ? { component: 'a', href: license.url, target: '_blank', rel: 'noopener noreferrer', clickable: true } : {})}
      />
    </Tooltip>
  );
};

export default LicenseChip;
