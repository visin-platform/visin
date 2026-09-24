import type { ComponentProps } from 'react';
import { Box } from '@mui/material';

/** A Markdown table, scrolling sideways on a phone rather than the whole page. */
export default function DocTable(props: ComponentProps<'table'>) {
  return (
    <Box sx={{ my: 3, overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: '12px' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.92rem',
          '& th, & td': { textAlign: 'left', verticalAlign: 'top', px: 2, py: 1.25 },
          '& th': { bgcolor: 'grey.50', fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider' },
          '& tr + tr td': { borderTop: '1px solid', borderColor: 'divider' }
        }}
        {...props}
      />
    </Box>
  );
}
