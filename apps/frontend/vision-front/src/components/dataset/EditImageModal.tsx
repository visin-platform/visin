import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography
} from '@mui/material';
import { ImageCategory, WeatherCondition } from '../../services/datasetImageService';

// Weather condition options
const WEATHER_CONDITIONS: { value: WeatherCondition; label: string }[] = [
  { value: 'day_fair', label: 'Day Fair' },
  { value: 'night_fair', label: 'Night Fair' },
  { value: 'day_rain', label: 'Day Rain' },
  { value: 'night_rain', label: 'Night Rain' },
  { value: 'snow', label: 'Snow' }
];

interface EditImageModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  categories: ImageCategory[];
  selectedCategory: string;
  setSelectedCategory: (id: string) => void;
  selectedWeather: WeatherCondition | '';
  setSelectedWeather: (weather: WeatherCondition | '') => void;
  selectedTags: string;
  setSelectedTags: (tags: string) => void;
}

const EditImageModal: React.FC<EditImageModalProps> = ({
  open,
  onClose,
  onSave,
  categories,
  selectedCategory,
  setSelectedCategory,
  selectedWeather,
  setSelectedWeather,
  selectedTags,
  setSelectedTags
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit Image
      </DialogTitle>
      <DialogContent>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 2
          }}>
          Update the category, weather condition, and tags for this image.
        </Typography>
        <TextField
          select
          fullWidth
          label="Category"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          slotProps={{
            select: {
              native: true,
            }
          }}
          sx={{ mb: 2 }}
        >
          <option value="">No Category</option>
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </TextField>
        <TextField
          select
          fullWidth
          label="Weather Condition"
          value={selectedWeather}
          onChange={(e) => setSelectedWeather(e.target.value as WeatherCondition | '')}
          slotProps={{
            select: {
              native: true,
            }
          }}
          sx={{ mb: 2 }}
        >
          <option value="">No Weather Condition</option>
          {WEATHER_CONDITIONS.map((condition) => (
            <option key={condition.value} value={condition.value}>
              {condition.label}
            </option>
          ))}
        </TextField>
        <TextField
          fullWidth
          label="Tags"
          value={selectedTags}
          onChange={(e) => setSelectedTags(e.target.value)}
          helperText="Enter tags separated by commas (e.g., cat, animal, pet)"
          placeholder="tag1, tag2, tag3"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditImageModal;
