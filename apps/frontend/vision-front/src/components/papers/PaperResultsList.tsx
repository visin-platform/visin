import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Chip, Link, Typography } from '@mui/material';
import { EmojiEvents, Folder, ModelTraining, LockOutlined } from '@mui/icons-material';
import type { PaperResult, PaperResultKind } from '../../types/paper';
import { resultPath } from '../../utils/visinLinks';

const KIND: Record<PaperResultKind, { label: string; icon: React.ReactElement }> = {
  project: { label: 'Project', icon: <Folder fontSize="small" /> },
  training: { label: 'Run', icon: <ModelTraining fontSize="small" /> },
  leaderboard: { label: 'Leaderboard', icon: <EmojiEvents fontSize="small" /> }
};

/**
 * What a paper cites on Visin. A result that is no longer public reads as such and names nothing, so a paper cannot
 * be used to learn what was once there; the paper's managers still see what it was, to fix it.
 */
const PaperResultsList: React.FC<{ results: PaperResult[] }> = ({ results }) => (
  <Box component="ul" aria-label="Results on Visin" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
    {results.map((result, index) => {
      const { label, icon } = KIND[result.kind];
      const path = result.available ? resultPath(result) : null;
      return (
        <Box
          component="li"
          key={`${result.kind}-${result.ref ?? index}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
        >
          <Box aria-hidden sx={{ display: 'flex', color: result.available ? 'primary.main' : 'text.disabled' }}>
            {result.available ? icon : <LockOutlined fontSize="small" />}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {result.available && path ? (
              <Link component={RouterLink} to={path} underline="hover" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {result.name ?? result.ref}
              </Link>
            ) : (
              <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {label} no longer public
                {result.ref && (
                  <Typography component="span" variant="body2" sx={{ ml: 1, fontWeight: 400, overflowWrap: 'anywhere' }}>
                    ({result.ref})
                  </Typography>
                )}
              </Typography>
            )}
            {result.available && result.kind !== 'project' && result.project && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {label} in {result.project.name}
              </Typography>
            )}
          </Box>
          {result.note && <Chip size="small" label={result.note} variant="outlined" />}
        </Box>
      );
    })}
  </Box>
);

export default PaperResultsList;
