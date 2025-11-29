import React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Autocomplete,
  Chip
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

interface TrainingFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  excludedTags: string[];
  onExcludedTagsChange: (tags: string[]) => void;
  availableTags: string[];
}

export const TrainingFilters: React.FC<TrainingFiltersProps> = ({
  searchTerm,
  onSearchChange,
  selectedTags,
  onTagsChange,
  excludedTags,
  onExcludedTagsChange,
  availableTags
}) => {
  return (
    <Box mb={3} display="flex" gap={2} flexWrap="wrap" alignItems="center">
      <TextField
        placeholder="Search trainings by name or description..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          )
        }}
        sx={{ flexGrow: 1, maxWidth: 500 }}
      />

      <Autocomplete
        multiple
        options={availableTags}
        value={selectedTags}
        onChange={(_, newValue) => onTagsChange(newValue)}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip {...getTagProps({ index })} key={option} label={option} size="small" />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={selectedTags.length === 0 ? "Filter by tags..." : undefined}
            sx={{ minWidth: 200 }}
          />
        )}
        size="small"
      />

      <Autocomplete
        multiple
        options={availableTags}
        value={excludedTags}
        onChange={(_, newValue) => onExcludedTagsChange(newValue)}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip {...getTagProps({ index })} key={option} label={option} size="small" color="error" />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={excludedTags.length === 0 ? "Hide by tags..." : undefined}
            sx={{ minWidth: 200 }}
          />
        )}
        size="small"
      />
    </Box>
  );
};

export default TrainingFilters;
