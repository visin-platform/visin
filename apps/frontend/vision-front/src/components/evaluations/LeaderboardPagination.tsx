import { Box, Pagination, Typography } from '@mui/material';
import type { LeaderboardPagination as PaginationInfo } from '../../types/evaluation';

const LeaderboardPagination = ({
  pagination,
  onChange,
  label
}: {
  pagination: PaginationInfo;
  onChange: (page: number) => void;
  label: string;
}) => {
  if (!pagination || pagination.pages <= 1) return null;
  return (
    <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      <Pagination
        count={pagination.pages}
        page={pagination.page}
        siblingCount={0}
        onChange={(_, page) => onChange(page)}
        aria-label={label}
      />
      <Typography variant="caption" color="text.secondary">
        {pagination.total} total
      </Typography>
    </Box>
  );
};

export default LeaderboardPagination;
