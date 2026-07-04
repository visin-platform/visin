import React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  Autocomplete,
  Chip,
  Paper,
  useTheme,
  alpha
} from '@mui/material';
import { Search as SearchIcon, FilterList as FilterIcon } from '@mui/icons-material';

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
  const theme = useTheme();

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2, 
        mb: 3, 
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper'
      }}
    >
      <Box
        sx={{
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          alignItems: "center"
        }}>
        <TextField
          placeholder="Search trainings..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          variant="outlined"
          size="small"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              sx: { borderRadius: 2 }
            }
          }}
          sx={{ flexGrow: 1, minWidth: { xs: '100%', md: 300 } }}
        />

        <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, flexWrap: 'wrap' }}>
          <Autocomplete
            multiple
            options={availableTags}
            value={selectedTags}
            onChange={(_, newValue) => onTagsChange(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  label={option}
                  size="small"
                  sx={{
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: theme.palette.primary.main,
                    fontWeight: 500
                  }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={selectedTags.length === 0 ? "Filter by tags" : undefined}
                size="small"
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <FilterIcon fontSize="small" color="action" />
                        </InputAdornment>
                        {params.slotProps.input.startAdornment}
                      </>
                    ),
                    sx: { borderRadius: 2 }
                  }
                }}
              />
            )}
            sx={{ minWidth: 250, flexGrow: 1 }}
          />

          <Autocomplete
            multiple
            options={availableTags}
            value={excludedTags}
            onChange={(_, newValue) => onExcludedTagsChange(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => (
                <Chip
                  {...getItemProps({ index })}
                  label={option}
                  size="small"
                  color="error"
                  variant="outlined"
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={excludedTags.length === 0 ? "Exclude tags" : undefined}
                size="small"
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    sx: { borderRadius: 2 }
                  }
                }}
              />
            )}
            sx={{ minWidth: 250, flexGrow: 1 }}
          />
        </Box>
      </Box>
    </Paper>
  );
};

export default TrainingFilters;
