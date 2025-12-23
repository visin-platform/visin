import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import {
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon
} from '@mui/icons-material';

interface LabelingControlsProps {
  handleLabel: (label: 'good' | 'bad') => void;
  handleSkip: () => void;
  labeling: boolean;
  isMobile: boolean;
}

const LabelingControls: React.FC<LabelingControlsProps> = ({
  handleLabel,
  handleSkip,
  labeling,
  isMobile
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ 
      flexShrink: 0, 
      bgcolor: 'background.paper', 
      py: 1.5, 
      px: { xs: 1, sm: 2 },
      borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
      boxShadow: `0 -2px 8px ${alpha(theme.palette.common.black, 0.05)}`
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 1, sm: 3 }, position: 'relative' }}>
        <Button
          variant="contained"
          color="success"
          size="medium"
          startIcon={!isMobile ? <ThumbUpIcon /> : undefined}
          onClick={() => handleLabel('good')}
          disabled={labeling}
          sx={{ 
            minWidth: { xs: 0, sm: 100 },
            flex: { xs: 1, sm: 'none' },
            py: 1, 
            fontSize: '0.9rem', 
            fontWeight: 600,
            borderRadius: 2,
            boxShadow: `0 2px 8px ${alpha(theme.palette.success.main, 0.25)}`,
            '&:hover': {
              boxShadow: `0 4px 12px ${alpha(theme.palette.success.main, 0.35)}`,
              transform: 'translateY(-1px)'
            },
            transition: 'all 0.15s ease'
          }}
        >
          {isMobile ? <ThumbUpIcon fontSize="small" /> : 'Good'}
        </Button>
        <Button
          variant="outlined"
          size="medium"
          onClick={() => handleSkip()}
          disabled={labeling}
          sx={{ 
            minWidth: { xs: 0, sm: 100 },
            flex: { xs: 1, sm: 'none' },
            py: 1, 
            fontSize: '0.9rem',
            fontWeight: 600,
            borderRadius: 2,
            borderWidth: 1.5,
            '&:hover': {
              borderWidth: 1.5,
              boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
              transform: 'translateY(-1px)'
            },
            transition: 'all 0.15s ease'
          }}
        >
          Skip
        </Button>
        <Button
          variant="contained"
          color="error"
          size="medium"
          startIcon={!isMobile ? <ThumbDownIcon /> : undefined}
          onClick={() => handleLabel('bad')}
          disabled={labeling}
          sx={{ 
            minWidth: { xs: 0, sm: 100 },
            flex: { xs: 1, sm: 'none' },
            py: 1, 
            fontSize: '0.9rem', 
            fontWeight: 600,
            borderRadius: 2,
            boxShadow: `0 2px 8px ${alpha(theme.palette.error.main, 0.25)}`,
            '&:hover': {
              boxShadow: `0 4px 12px ${alpha(theme.palette.error.main, 0.35)}`,
              transform: 'translateY(-1px)'
            },
            transition: 'all 0.15s ease'
          }}
        >
          {isMobile ? <ThumbDownIcon fontSize="small" /> : 'Bad'}
        </Button>
        
        {/* Loading overlay when labeling */}
        {labeling && (
          <Box sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: alpha(theme.palette.background.paper, 0.9),
            borderRadius: 2,
            zIndex: 10
          }}>
            <Box sx={{ textAlign: 'center' }}>
              <CircularProgress size={24} sx={{ mb: 0.5 }} />
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                Saving...
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default LabelingControls;
