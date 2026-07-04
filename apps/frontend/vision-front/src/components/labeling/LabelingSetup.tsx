import React from 'react';
import {
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Box,
  alpha,
  useTheme
} from '@mui/material';
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material';
import { WeatherCondition } from '../../services/datasetImageService';

interface LabelingSetupProps {
  imageLimit: number;
  setImageLimit: (limit: number) => void;
  selectedWeatherFilter: WeatherCondition | '';
  setSelectedWeatherFilter: (filter: WeatherCondition | '') => void;
  startLabeling: () => void;
  loading: boolean;
  weatherConditions: { value: WeatherCondition; label: string }[];
}

const LabelingSetup: React.FC<LabelingSetupProps> = ({
  imageLimit,
  setImageLimit,
  selectedWeatherFilter,
  setSelectedWeatherFilter,
  startLabeling,
  loading,
  weatherConditions
}) => {
  const theme = useTheme();

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Paper 
        elevation={0} 
        sx={{ 
          p: { xs: 3, md: 5 }, 
          mb: 3, 
          maxWidth: 500, 
          mx: 'auto',
          boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          borderRadius: 3
        }}
      >
        <Typography variant="h5" sx={{ mb: 4, fontWeight: 600 }}>
          Image Labeling Setup
        </Typography>
        
        <TextField
          fullWidth
          type="number"
          label="Number of images to label"
          value={imageLimit}
          onChange={(e) => setImageLimit(Math.max(1, Number(e.target.value) || 1))}
          slotProps={{ htmlInput: { min: 1 } }}
          sx={{ mb: 4 }}
          helperText="Maximum number of unlabeled images to load for this session"
          variant="outlined"
        />

        <FormControl fullWidth sx={{ mb: 4 }}>
          <InputLabel>Weather Condition (Optional)</InputLabel>
          <Select
            value={selectedWeatherFilter}
            onChange={(e) => setSelectedWeatherFilter(e.target.value as WeatherCondition | '')}
            label="Weather Condition (Optional)"
            variant="outlined"
          >
            <MenuItem value="">
              <em>All Weather Conditions</em>
            </MenuItem>
            {weatherConditions.map((condition) => (
              <MenuItem key={condition.value} value={condition.value}>
                {condition.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={startLabeling}
          disabled={loading || imageLimit < 1}
          fullWidth
          sx={{ py: 2, fontSize: '1.1rem', fontWeight: 600, borderRadius: 2 }}
        >
          {loading ? 'Loading Images...' : `Start Labeling`}
        </Button>
      </Paper>
    </Box>
  );
};

export default LabelingSetup;
