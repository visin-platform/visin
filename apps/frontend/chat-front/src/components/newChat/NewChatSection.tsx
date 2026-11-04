import { Box, Stack, Typography } from '@mui/material';
import { type ReactNode } from 'react';
export function Section({
  icon,
  title,
  note,
  children
}: {
  icon: ReactNode;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <Box component="section" aria-label={title} sx={{ px: 2, py: 2 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 1 }}>
        {note}
      </Typography>
      {children}
    </Box>
  );
}
