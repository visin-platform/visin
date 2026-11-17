import React, { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Collapse,
  TextField,
  InputAdornment,
  Autocomplete,
  Chip,
  Paper,
  useTheme
} from '@mui/material';
import { Search as SearchIcon, FilterList as FilterIcon } from '@mui/icons-material';
import { livePalette, tint, useCompactLayout } from '@visin/frontend-core';

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
  // On a phone the tag pickers (about 120px) would sit above the first run: they open from a button beside the search.
  const compact = useCompactLayout();
  const [open, setOpen] = useState(false);
  const active = selectedTags.length + excludedTags.length;

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2, 
        mb: 3, 
        borderRadius: 2,
        border: `1px solid ${livePalette(theme).divider}`,
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
          sx={{ flex: { xs: '1 1 140px', md: '1 1 auto' }, minWidth: { xs: 0, md: 300 } }}
        />

        {compact && (
          <Button
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="training-tag-filters"
            startIcon={
              <Badge color="primary" badgeContent={active} invisible={active === 0}>
                <FilterIcon />
              </Badge>
            }
            sx={{ flexShrink: 0, borderRadius: 2, height: 40 }}
          >
            Filters
          </Button>
        )}

        <Collapse in={!compact || open} unmountOnExit={compact} id="training-tag-filters" sx={{ width: compact ? '100%' : 'auto', flexGrow: 1 }}>
        <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, flexWrap: 'wrap' }}>
          <Autocomplete
            multiple
            options={availableTags}
            value={selectedTags}
            onChange={(_, newValue) => onTagsChange(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...itemProps } = getItemProps({ index });
                return (
                  <Chip
                    key={key}
                    {...itemProps}
                    label={option}
                    size="small"
                    sx={{
                      bgcolor: tint(livePalette(theme).primary.main, 0.1),
                      color: livePalette(theme).primary.main,
                      fontWeight: 500
                    }}
                  />
                );
              })
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
            sx={{ minWidth: { xs: '100%', md: 250 }, flexGrow: 1 }}
          />

          <Autocomplete
            multiple
            options={availableTags}
            value={excludedTags}
            onChange={(_, newValue) => onExcludedTagsChange(newValue)}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...itemProps } = getItemProps({ index });
                return (
                  <Chip
                    key={key}
                    {...itemProps}
                    label={option}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                );
              })
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
            sx={{ minWidth: { xs: '100%', md: 250 }, flexGrow: 1 }}
          />
        </Box>
        </Collapse>
      </Box>
    </Paper>
  );
};

export default TrainingFilters;
