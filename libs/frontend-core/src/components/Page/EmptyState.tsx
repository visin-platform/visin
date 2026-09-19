import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

/** What stands in for a list with nothing in it: what would be here, and how to add the first one. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Box sx={{ textAlign: 'center', px: 3, py: { xs: 6, md: 8 } }}>
      <Box
        aria-hidden
        sx={(theme) => ({
          width: 56,
          height: 56,
          mx: 'auto',
          mb: 2,
          borderRadius: '16px',
          display: 'grid',
          placeItems: 'center',
          color: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          '& svg': { fontSize: 28 }
        })}
      >
        {icon}
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{title}</Typography>
      {description && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 420, mx: 'auto' }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Box>
  );
}
