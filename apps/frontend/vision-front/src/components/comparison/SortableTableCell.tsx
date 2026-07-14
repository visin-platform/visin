import { Box, TableCell, Typography } from '@mui/material';
import { ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon } from '@mui/icons-material';

interface SortableTableCellProps {
  column: string;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
}

const SortableTableCell: React.FC<SortableTableCellProps> = ({
  column,
  children,
  align = 'left',
  sortColumn,
  sortDirection,
  onSort
}) => (
  <TableCell align={align}>
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' }
      }}
      onClick={() => onSort(column)}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
        {children}
      </Typography>
      {sortColumn === column && (
        sortDirection === 'asc' ?
          <ArrowUpwardIcon sx={{ fontSize: 16 }} /> :
          <ArrowDownwardIcon sx={{ fontSize: 16 }} />
      )}
    </Box>
  </TableCell>
);

export default SortableTableCell;
