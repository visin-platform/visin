import { Box, Skeleton } from '@mui/material';

export interface ListSkeletonProps {
  /** How many placeholder rows. Defaults to 5. */
  rows?: number;
  /** Names the region for assistive technology. Defaults to "Loading". */
  label?: string;
}

/**
 * The shape of a list while it loads: rows where the rows will be. A spinner in the middle of an empty page says only
 * that something is happening; this says what is coming, and the page does not jump when it arrives.
 */
export function ListSkeleton({ rows = 5, label = 'Loading' }: ListSkeletonProps) {
  return (
    <Box role="status" aria-label={label} aria-busy="true" sx={{ display: 'grid', gap: 1.5 }}>
      {Array.from({ length: rows }, (_, index) => (
        <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={`${70 - (index % 3) * 12}%`} />
            <Skeleton width={`${40 + (index % 2) * 15}%`} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
