import React, { useState } from 'react';
import {
  Box,
  Chip,
  TextField,
  Autocomplete,
  Typography
} from '@mui/material';

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags?: string[];
  label?: string;
  placeholder?: string;
  maxTags?: number;
}

const TagInput: React.FC<TagInputProps> = ({
  tags,
  onTagsChange,
  availableTags = [],
  label = 'Tags',
  placeholder = 'Add tags...',
  maxTags = 10
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < maxTags) {
      onTagsChange([...tags, trimmedTag]);
      setInputValue('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      handleAddTag(inputValue);
    }
  };

  const allSuggestions = Array.from(new Set([...availableTags, ...tags]));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {label}
      </Typography>

      <Autocomplete
        multiple
        freeSolo
        options={allSuggestions}
        value={tags}
        inputValue={inputValue}
        onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
        onChange={(_, newValue) => {
          // Handle both string and array inputs
          if (typeof newValue === 'string') {
            handleAddTag(newValue);
          } else {
            onTagsChange(newValue);
          }
        }}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option}
              label={option}
              size="small"
              onDelete={() => handleRemoveTag(option)}
              sx={{ mr: 0.5, mb: 0.5 }}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={tags.length >= maxTags ? `Maximum ${maxTags} tags allowed` : placeholder}
            onKeyDown={handleKeyDown}
            disabled={tags.length >= maxTags}
            helperText={tags.length >= maxTags ? `Maximum ${maxTags} tags allowed` : undefined}
          />
        )}
        sx={{
          '& .MuiAutocomplete-inputRoot': {
            minHeight: '56px',
            alignItems: 'flex-start',
          }
        }}
      />

      {tags.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => handleRemoveTag(tag)}
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default TagInput;