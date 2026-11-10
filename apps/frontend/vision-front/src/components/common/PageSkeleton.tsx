import { ContentSkeleton } from './ContentSkeleton';
import { Box, Container, Skeleton, Typography } from '@mui/material';

/**
 * What a page of runs looks like while it loads: a title, its tabs, a row of figures and two charts, as grey shapes in
 * the places the real thing will be. The page then appears where the shapes were, instead of replacing a lone spinner
 * in the middle of nothing. An indeterminate progress bar to a screen reader, as the spinner it replaces was.
 */
export function PageSkeleton({
  label = 'Loading',
  layout = 'dashboard'
}: {
  label?: string;
  layout?: 'dashboard' | 'detail';
}) {
  if (layout === 'detail')
    return (
      <Container maxWidth="xl" role="progressbar" aria-label={label} aria-busy="true" sx={{ pb: 4 }}>
        <Skeleton width={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={80} sx={{ mb: 3 }} />
        <ContentSkeleton label={label} />
      </Container>
    );
  return (
    <Container maxWidth="xl" role="progressbar" aria-label={label} aria-busy="true" sx={{ pb: 4 }}>
      <Typography component="div" sx={{ mb: 2 }}>
        <Skeleton width={220} />
      </Typography>
      <Skeleton variant="rounded" height={40} sx={{ mb: 1.5, width: { xs: '70%', sm: 340 } }} />
      <Skeleton width="45%" sx={{ mb: 3 }} />
      <Box sx={{ display: 'flex', gap: 1, mb: 3, overflow: 'hidden' }}>
        {[88, 72, 104, 96, 80].map((width, index) => (
          <Skeleton key={index} variant="rounded" height={36} width={width} sx={{ flexShrink: 0 }} />
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} variant="rounded" height={96} />
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
        <Skeleton variant="rounded" height={280} />
        <Skeleton variant="rounded" height={280} />
      </Box>
    </Container>
  );
}
