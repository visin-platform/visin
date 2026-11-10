import { Box, Skeleton } from '@mui/material';

/** Preserve a list or card grid's footprint while its first response is loading. */
export function ContentSkeleton({ label, cards = false }: { label: string; cards?: boolean }) {
  return (
    <Box
      role="status"
      aria-label={label}
      aria-busy="true"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: cards
          ? { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }
          : '1fr'
      }}
    >
      {Array.from({ length: cards ? 8 : 5 }, (_, i) => (
        <Box key={i} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          {cards && <Skeleton variant="rounded" height={140} sx={{ mb: 2 }} />}
          <Skeleton width="65%" />
          <Skeleton width="40%" />
        </Box>
      ))}
    </Box>
  );
}
