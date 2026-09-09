import React, { useEffect } from 'react';
import { Alert, Box, CircularProgress, Link, Typography } from '@mui/material';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * The labeling tool lives in label-front now, and the sidebar's Labeling entry
 * links straight there. This route only exists to keep old `/image-labeling`
 * bookmarks and deep links working, so it forwards immediately instead of
 * showing an interstitial the user has to click through. `replace` keeps the
 * dead URL out of history, so Back returns to Vision rather than bouncing.
 *
 * With no `LABEL_FRONT_URL` configured it forwards nowhere and says so. It used
 * to fall back to our own hosted label-front, which quietly sent the users of
 * any other deployment off to someone else's domain.
 */
const LabelingRedirectPage: React.FC = () => {
  const labelFrontUrl = getGlobalConfig().LABEL_FRONT_URL;
  const target = labelFrontUrl ? `${labelFrontUrl.replace(/\/$/, '')}/jobs` : null;

  useEffect(() => {
    if (target) {
      window.location.replace(target);
    }
  }, [target]);

  if (!target) {
    return (
      <Box sx={{ pt: 6, px: 2, maxWidth: 600, mx: 'auto' }}>
        <Alert severity="info">
          Labeling is not configured for this deployment. Set <code>LABEL_FRONT_URL</code> to
          the address of your label-front instance to enable it.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 10 }}>
      <CircularProgress size={28} />
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Opening Labeling…
      </Typography>
      {/* A visible fallback if the automatic redirect is blocked. */}
      <Link href={target} variant="body2">
        Continue to Labeling
      </Link>
    </Box>
  );
};

export default LabelingRedirectPage;
