import React from 'react';
import {
  Paper,
  CircularProgress,
  Typography,
  Box,
  alpha,
  useTheme
} from '@mui/material';

interface LabelingMetricsProps {
  loading: boolean;
  metrics: {
    good: number;
    goodPercentage: number;
    bad: number;
    badPercentage: number;
    unlabeled: number;
    unlabeledPercentage: number;
    total: number;
  } | undefined;
}

const LabelingMetrics: React.FC<LabelingMetricsProps> = ({ loading, metrics }) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Paper 
        sx={{ 
          p: { xs: 2, md: 3 }, 
          mb: 3,
          boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          textAlign: 'center'
        }}
      >
        <CircularProgress size={24} sx={{ mb: 1 }} />
        <Typography variant="body1" sx={{ fontWeight: 500 }}>Loading statistics...</Typography>
      </Paper>
    );
  }

  if (!metrics) return null;

  return (
    <Paper 
      sx={{ 
        p: { xs: 2, md: 3 }, 
        mb: 3,
        boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
      }}
    >
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
        Labeling Progress
      </Typography>
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, 
        gap: 2, 
        mb: 2 
      }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" color="success.main" fontWeight="bold">
            {metrics.good.toLocaleString()}
          </Typography>
          <Typography variant="caption" color="success.main" fontWeight={500} display="block">
            Good ({metrics.goodPercentage}%)
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" color="error.main" fontWeight="bold">
            {metrics.bad.toLocaleString()}
          </Typography>
          <Typography variant="caption" color="error.main" fontWeight={500} display="block">
            Bad ({metrics.badPercentage}%)
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" color="warning.main" fontWeight="bold">
            {metrics.unlabeled.toLocaleString()}
          </Typography>
          <Typography variant="caption" color="warning.main" fontWeight={500} display="block">
            Unlabeled ({metrics.unlabeledPercentage}%)
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" color="primary.main" fontWeight="bold">
            {metrics.total.toLocaleString()}
          </Typography>
          <Typography variant="caption" color="primary.main" fontWeight={500} display="block">
            Total
          </Typography>
        </Box>
      </Box>
      
      {/* Progress Bar */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" sx={{ mb: 1, textAlign: 'center', fontWeight: 500, fontSize: '0.8rem' }}>
          Completion: {metrics.good + metrics.bad} / {metrics.total} 
          ({Math.round(((metrics.good + metrics.bad) / metrics.total) * 100)}%)
        </Typography>
        <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
          <Box 
            sx={{ 
              backgroundColor: 'success.main', 
              width: `${(metrics.good / metrics.total) * 100}%` 
            }} 
          />
          <Box 
            sx={{ 
              backgroundColor: 'error.main', 
              width: `${(metrics.bad / metrics.total) * 100}%` 
            }} 
          />
          <Box 
            sx={{ 
              backgroundColor: 'warning.main', 
              width: `${(metrics.unlabeled / metrics.total) * 100}%` 
            }} 
          />
        </Box>
      </Box>
    </Paper>
  );
};

export default LabelingMetrics;
