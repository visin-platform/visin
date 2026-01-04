import React, { useState, useMemo } from 'react';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Chip,
  Typography,
  InputAdornment,
  Autocomplete,
  CircularProgress
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { Training } from '../../types';

interface TrainingSelectorProps {
  trainings: Training[];
  selectedTrainingIds: string[];
  onTrainingToggle: (trainingId: string) => void;
  maxSelections?: number;
  isLoading?: boolean;
}

const TrainingSelector: React.FC<TrainingSelectorProps> = ({
  trainings,
  selectedTrainingIds,
  onTrainingToggle,
  maxSelections = 20,
  isLoading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Get all unique tags from trainings
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    trainings.forEach(training => {
      training.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [trainings]);

  // Filter trainings based on search and tags
  const filteredTrainings = useMemo(() => {
    return trainings.filter(training => {
      // Search filter
      const matchesSearch = !searchQuery ||
        training.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        training.description?.toLowerCase().includes(searchQuery.toLowerCase());

      // Tags filter
      const matchesTags = selectedTags.length === 0 ||
        selectedTags.every(tag => training.tags?.includes(tag));

      return matchesSearch && matchesTags;
    });
  }, [trainings, searchQuery, selectedTags]);

  const handleTagRemove = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  return (
    <Box>
      {/* Search Input */}
      <TextField
        fullWidth
        placeholder="Search trainings by name or description..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      {/* Tags Filter */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Filter by tags:
        </Typography>
        <Autocomplete
          multiple
          options={allTags}
          value={selectedTags}
          onChange={(_, newValue) => setSelectedTags(newValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select tags to filter..."
              size="small"
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={option}
                label={option}
                size="small"
                onDelete={() => handleTagRemove(option)}
              />
            ))
          }
          size="small"
          sx={{ mb: 1 }}
        />
        {selectedTags.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Active filters:
            </Typography>
            {selectedTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => handleTagRemove(tag)}
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        )}
      </Box>

      {/* Results Summary */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Showing {filteredTrainings.length} of {trainings.length} trainings
        {selectedTags.length > 0 && ` (filtered by ${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''})`}
      </Typography>

      {/* Training List */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <List sx={{ maxHeight: 300, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {filteredTrainings.length === 0 ? (
            <ListItem>
              <ListItemText
                primary="No trainings found"
                secondary={searchQuery || selectedTags.length > 0 ? "Try adjusting your search or filters" : "No trainings available"}
              />
            </ListItem>
          ) : (
            filteredTrainings.map((training) => (
              <ListItem key={training._id} dense>
                <Checkbox
                  checked={selectedTrainingIds.includes(training._id)}
                  onChange={() => onTrainingToggle(training._id)}
                  disabled={!selectedTrainingIds.includes(training._id) && selectedTrainingIds.length >= maxSelections}
                />
                <ListItemText
                  primary={training.name}
                  secondary={
                    <Box>
                      {training.description && (
                        <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
                          {training.description}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Status: {training.status}
                        </Typography>
                        {training.tags && training.tags.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {training.tags.slice(0, 3).map(tag => (
                              <Chip
                                key={tag}
                                label={tag}
                                size="small"
                                variant="outlined"
                                sx={{ height: 16, fontSize: '0.7rem' }}
                              />
                            ))}
                            {training.tags.length > 3 && (
                              <Typography variant="caption" color="text.secondary">
                                +{training.tags.length - 3} more
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
            ))
          )}
        </List>
      )}

      {/* Selection Summary */}
      <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
        Selected: {selectedTrainingIds.length}/{maxSelections} trainings
      </Typography>
    </Box>
  );
};

export default TrainingSelector;