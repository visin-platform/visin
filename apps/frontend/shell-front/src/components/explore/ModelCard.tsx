import { Link as RouterLink } from 'react-router-dom';
import { Box, CircularProgress, Link, Typography, useTheme } from '@mui/material';
import { Memory } from '@mui/icons-material';
import { livePalette, onImage, tint } from '@visin/frontend-core';
import type { ExploreModel } from '../../services/exploreApi';
import { panelSx } from '../home/panel';

/** Opens the run, where the checkpoint's formats, preprocessing and outputs are shown together. */
export function ModelCard({ row, formats }: { row: ExploreModel; formats?: string[] }) {
  const color = livePalette(useTheme()).primary.main;
  const { model } = row;
  // A checkpoint in several formats is one card, named by its file without a format.
  const merged = (formats?.length ?? 0) > 1;
  const title =
    model.provider === 'hf'
      ? `${model.repo ?? 'Hub model'}${model.revision ? ` @ ${model.revision.slice(0, 7)}` : ''}`
      : merged && model.filename
        ? model.filename.replace(/\.(onnx|pth)$/i, '')
        : (model.filename ?? `${model.format} checkpoint`);
  const coverUrl = row.project?.coverUrl;
  const status =
    model.status === 'failed' ? 'Failed verification' : model.status !== 'ready' ? 'Being verified' : undefined;
  return (
    <Box component="article" sx={{ ...panelSx, overflow: 'hidden' }}>
      <Box
        aria-hidden
        sx={{
          position: 'relative',
          aspectRatio: '16 / 7',
          display: 'grid',
          placeItems: 'center',
          color,
          bgcolor: tint(color, 0.1),
          overflow: 'hidden'
        }}
      >
        {coverUrl && (
          <Box
            component="img"
            src={coverUrl}
            alt=""
            loading="lazy"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {/* Over a picture the chip says "model" and keeps the card from reading as the project's own. */}
        <Box
          sx={
            coverUrl
              ? {
                  position: 'absolute',
                  left: 8,
                  bottom: 8,
                  display: 'flex',
                  p: 0.75,
                  borderRadius: 1.5,
                  color: onImage.ink,
                  bgcolor: onImage.scrimStrong
                }
              : { display: 'flex' }
          }
        >
          <Memory fontSize={coverUrl ? 'small' : 'large'} />
        </Box>
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
              Visin · {merged ? formats!.map((format) => `.${format}`).join(' · ') : `.${model.format}`} ·{' '}
              {status ?? model.license?.name ?? model.license?.id ?? 'Licence not stated'}
            </>
          )}
        </Typography>
      </Box>
    </Box>
  );
}
