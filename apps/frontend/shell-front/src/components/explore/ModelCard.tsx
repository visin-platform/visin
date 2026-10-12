import { Link as RouterLink } from 'react-router-dom';
import { Box, CircularProgress, Link, Typography, useTheme } from '@mui/material';
import { Memory } from '@mui/icons-material';
import { livePalette, tint } from '@visin/frontend-core';
import type { ExploreModel } from '../../services/exploreApi';
import { panelSx } from '../home/panel';

/** Opens the run, where the checkpoint's formats, preprocessing and outputs are shown together. */
export function ModelCard({ row }: { row: ExploreModel }) {
  const color = livePalette(useTheme()).primary.main;
  const { model } = row;
  const title =
    model.provider === 'hf'
      ? `${model.repo ?? 'Hub model'}${model.revision ? ` @ ${model.revision.slice(0, 7)}` : ''}`
      : (model.filename ?? `${model.format} checkpoint`);
  const status =
    model.status === 'failed' ? 'Failed verification' : model.status !== 'ready' ? 'Being verified' : undefined;
  return (
    <Box component="article" sx={{ ...panelSx, overflow: 'hidden' }}>
      <Box
        aria-hidden
        sx={{ aspectRatio: '16 / 7', display: 'grid', placeItems: 'center', color, bgcolor: tint(color, 0.1) }}
      >
        <Memory fontSize="large" />
      </Box>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.5, overflowWrap: 'anywhere' }}>
        {row.project && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {row.project.name}
          </Typography>
        )}
        <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700 }}>
          <Link component={RouterLink} to={`/trainings/${row.training._id}`} underline="none">
            {title}
          </Link>
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {row.training.name}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {model.provider === 'hf' ? (
            'Hugging Face'
          ) : (
            <>
              {model.status === 'verifying' && <CircularProgress size={12} aria-label="Verifying model" />}
              Visin · .{model.format} · {status ?? model.license?.name ?? model.license?.id ?? 'Licence not stated'}
            </>
          )}
        </Typography>
      </Box>
    </Box>
  );
}
