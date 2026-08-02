import React, { useEffect } from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * The labeling tool lives in label-front now, and the sidebar's Labeling entry
 * links straight there. This route only exists to keep old `/image-labeling`
 * bookmarks and deep links working, so it forwards immediately instead of
 * showing an interstitial the user has to click through. `replace` keeps the
 * dead URL out of history, so Back returns to Vision rather than bouncing.
 */
const LabelingRedirectPage: React.FC = () => {
  const labelFrontUrl = getGlobalConfig().LABEL_FRONT_URL || 'https://label.visin.eu';
  const target = `${labelFrontUrl.replace(/\/$/, '')}/jobs`;

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

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
