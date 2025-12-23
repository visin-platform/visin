import React from 'react';
import {
  Box,
  Button,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon
} from '@mui/icons-material';

interface LabelingHeaderProps {
  handlePrevious: () => void;
  handleNext: () => void;
  currentImageIndex: number;
  totalImages: number;
  isMobile: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const LabelingHeader: React.FC<LabelingHeaderProps> = ({
  handlePrevious,
  handleNext,
  currentImageIndex,
  totalImages,
  isMobile,
  setSettingsOpen
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      px: { xs: 1, sm: 2 }, 
      py: 1, 
      flexShrink: 0, 
      minHeight: 48,
      bgcolor: 'background.paper',
      borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      boxShadow: `0 1px 4px ${alpha(theme.palette.common.black, 0.08)}`
    }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<NavigateBeforeIcon />}
          onClick={handlePrevious}
          disabled={currentImageIndex === 0}
          sx={{ 
            fontWeight: 500, 
            py: 0.5, 
            px: { xs: 1, sm: 1.5 }, 
            fontSize: '0.875rem',
            minWidth: { xs: 0, sm: 64 }
          }}
        >
          {isMobile ? 'Prev' : 'Previous'}
        </Button>
        <Button
          variant="outlined"
          size="small"
          endIcon={<NavigateNextIcon />}
          onClick={handleNext}
          disabled={currentImageIndex === totalImages - 1}
          sx={{ 
            fontWeight: 500, 
            py: 0.5, 
            px: { xs: 1, sm: 1.5 }, 
            fontSize: '0.875rem',
            minWidth: { xs: 0, sm: 64 }
          }}
        >
          {isMobile ? 'Next' : 'Next'}
        </Button>
      </Box>
      
      <Typography 
        variant="subtitle1" 
        sx={{ 
          fontWeight: 600, 
          color: 'text.primary', 
          fontSize: '0.95rem',
          display: { xs: 'none', sm: 'block' }
        }}
      >
        Image Labeling
      </Typography>
      
      <Button 
        variant="outlined" 
        onClick={() => setSettingsOpen(true)} 
        size="small"
        sx={{ fontWeight: 500, py: 0.5, px: 1.5, fontSize: '0.875rem' }}
      >
        Settings
      </Button>
    </Box>
  );
};

export default LabelingHeader;
