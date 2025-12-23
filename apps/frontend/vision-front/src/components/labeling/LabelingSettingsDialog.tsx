import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  alpha,
  useTheme
} from '@mui/material';
import { WeatherCondition } from '../../services/datasetImageService';

interface LabelingSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  imageLimit: number;
  setImageLimit: (limit: number) => void;
  selectedWeatherFilter: WeatherCondition | '';
  setSelectedWeatherFilter: (filter: WeatherCondition | '') => void;
  resetLabeling: () => void;
  weatherConditions: { value: WeatherCondition; label: string }[];
}

const LabelingSettingsDialog: React.FC<LabelingSettingsDialogProps> = ({
  open,
  onClose,
  imageLimit,
  setImageLimit,
  selectedWeatherFilter,
  setSelectedWeatherFilter,
  resetLabeling,
  weatherConditions
}) => {
  const theme = useTheme();

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: 2,
          boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.3)}`
        }
      }}
    >
      <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>
        Labeling Settings
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Adjust your labeling preferences and return to setup if needed.
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            type="number"
            label="Number of images to label"
            value={imageLimit}
            onChange={(e) => setImageLimit(Math.max(1, Number(e.target.value) || 1))}
            inputProps={{ min: 1 }}
            helperText="Maximum number of unlabeled images to load for this session"
            size="small"
          />

          <FormControl fullWidth size="small">
            <InputLabel>Weather Condition Filter</InputLabel>
            <Select
              value={selectedWeatherFilter}
              onChange={(e) => setSelectedWeatherFilter(e.target.value as WeatherCondition | '')}
              label="Weather Condition Filter"
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
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1 }}>
        <Button 
          onClick={onClose}
          variant="outlined"
          size="small"
        >
          Cancel
        </Button>
        <Button 
          onClick={resetLabeling}
          variant="contained"
          size="small"
          sx={{ fontWeight: 600 }}
        >
          Return to Setup
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelingSettingsDialog;
