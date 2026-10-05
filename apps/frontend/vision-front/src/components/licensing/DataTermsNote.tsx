import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import type { DataTerms } from '../../types/license';
import LicenseChip from './LicenseChip';

/**
 * What the publisher of a suite says about the data it scores: licence, where it lives, how to credit it. Visin holds
 * no copy of the data, so this is how a reader learns what they may do with it before they go and get it.
 */
const DataTermsNote: React.FC<{ terms: DataTerms | undefined }> = ({ terms }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }} aria-label="Terms of the evaluated data">
    <Typography variant="body2" color="text.secondary">
      Data licence
    </Typography>
    <LicenseChip license={terms?.license} />
    {terms?.sourceUrl && (
      <Typography variant="body2" color="text.secondary">
        ·{' '}
        <Link href={terms.sourceUrl} target="_blank" rel="noopener noreferrer">
          Where to get the data
        </Link>
      </Typography>
    )}
    {terms?.credit && (
      <Typography variant="body2" color="text.secondary">
        · Credit: {terms.credit}
      </Typography>
    )}
  </Box>
);

export default DataTermsNote;
