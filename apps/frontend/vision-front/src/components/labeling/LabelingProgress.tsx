import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  alpha,
  useTheme
} from '@mui/material';

interface LabelingProgressProps {
  currentImageIndex: number;
  totalImages: number;
  labeledCount: number;
  sessionProgress: number;
}

const LabelingProgress: React.FC<LabelingProgressProps> = ({
  currentImageIndex,
  totalImages,
  labeledCount,
  sessionProgress
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ 
      px: { xs: 1, sm: 2 }, 
      py: 0.75, 
      flexShrink: 0,
      bgcolor: alpha(theme.palette.primary.main, 0.02),
      borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
          {currentImageIndex + 1} / {totalImages}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
          Labeled: {labeledCount}
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={sessionProgress} 
        sx={{ 
          height: 4, 
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          '& .MuiLinearProgress-bar': {
            borderRadius: 2,
            backgroundColor: theme.palette.primary.main
          }
        }} 
      />
    </Box>
  );
};

export default LabelingProgress;
