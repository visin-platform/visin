import React from 'react';
import {
  Box,
  Typography,
  Button,
  alpha,
  useTheme
} from '@mui/material';
import {
  DeleteOutline as DeleteOutlineIcon,
  Compare as CompareIcon,
  Download as DownloadIcon
} from '@mui/icons-material';

interface BulkActionsBarProps {
  selectedCount: number;
  onExport: () => void;
  onCompare: () => void;
  onDelete: () => void;
  isAuthenticated: boolean;
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedCount,
  onExport,
  onCompare,
  onDelete,
  isAuthenticated
}) => {
  const theme = useTheme();

  if (selectedCount === 0) return null;

  return (
    <Box 
      sx={{ 
        mb: 2, 
        p: 2, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        borderRadius: 2
      }}
    >
      <Typography variant="body2" fontWeight={600} color="primary">
        {selectedCount} selected
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Button
        variant="outlined"
        startIcon={<DownloadIcon />}
        onClick={onExport}
        size="small"
        sx={{ borderRadius: 2 }}
      >
        Export CSV
      </Button>
      {selectedCount > 1 && (
        <Button
          variant="contained"
          startIcon={<CompareIcon />}
          onClick={onCompare}
          color="primary"
          size="small"
          sx={{ borderRadius: 2 }}
        >
          Compare
        </Button>
      )}
      {isAuthenticated && (
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<DeleteOutlineIcon />}
          onClick={onDelete}
          sx={{ borderRadius: 2 }}
        >
          Delete
        </Button>
      )}
    </Box>
  );
};

export default BulkActionsBar;
