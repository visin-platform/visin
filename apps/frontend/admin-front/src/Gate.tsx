import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/** A page of its own for someone who cannot be in Administration yet: why, and what they can do about it. */
export default function Gate({ title, children, actions }: { title: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack spacing={2} sx={{ maxWidth: 440, textAlign: 'center', alignItems: 'center' }}>
        <Box component="img" src="/logo.svg" alt="Visin" sx={{ width: 48, height: 48 }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {children && <Typography color="text.secondary">{children}</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {actions}
        </Stack>
      </Stack>
    </Box>
  );
}
