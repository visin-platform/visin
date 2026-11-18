import React from 'react';
import {
  Paper,
  Stack,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip
} from '@mui/material';
import { FilterList as FilterListIcon } from '@mui/icons-material';
import { Epoch, Visualization } from '../../types';

interface VisualizationFiltersProps {
  selectedType: string;
  setSelectedType: (type: string) => void;
  types: string[];
  selectedEpochFilter: string;
  setSelectedEpochFilter: (epoch: string) => void;
  epochs: Epoch[];
  selectedImageName: string;
  setSelectedImageName: (name: string) => void;
  selectedForCompare: Visualization[];
  setSelectedForCompare: (viz: Visualization[]) => void;
  /** what a point is called: an epoch, or for an inference run the frames done */
  pointLabel?: string;
}

/** Past this many points a list to choose from is no help; the number is typed instead. */
const MAX_LISTED_POINTS = 100;

const VisualizationFilters: React.FC<VisualizationFiltersProps> = ({
  selectedType,
  setSelectedType,
  types,
  selectedEpochFilter,
  setSelectedEpochFilter,
  epochs,
  selectedImageName,
  setSelectedImageName,
  selectedForCompare,
  setSelectedForCompare,
  pointLabel = 'Epoch'
}) => {
  return (
    <Paper 
      elevation={0} 
      variant="outlined" 
      sx={{ 
        p: 2, 
        mb: 3, 
        borderRadius: 2,
        bgcolor: 'background.paper'
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{
        alignItems: { xs: 'stretch', sm: 'center' }
      }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            color: "text.secondary",
            minWidth: { xs: 'auto', sm: 'fit-content' }
          }}>
          <FilterListIcon sx={{ mr: 1 }} />
          <Typography variant="subtitle2" sx={{
            fontWeight: 600
          }}>Filters:</Typography>
        </Box>
        
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
          <InputLabel id="visualization-type-label">Type</InputLabel>
          <Select
            labelId="visualization-type-label"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            label="Type"
          >
            <MenuItem value="all">All Types</MenuItem>
            {types.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {epochs.length > MAX_LISTED_POINTS ? (
          <TextField
            size="small"
            type="number"
            label={pointLabel}
            placeholder="Any"
            value={selectedEpochFilter === 'all' ? '' : selectedEpochFilter}
            onChange={(e) => setSelectedEpochFilter(e.target.value === '' ? 'all' : e.target.value)}
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ minWidth: { xs: '100%', sm: 150 } }}
          />
        ) : (
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
            <InputLabel id="visualization-point-label">{pointLabel}</InputLabel>
            <Select
              labelId="visualization-point-label"
              value={selectedEpochFilter}
              onChange={(e) => setSelectedEpochFilter(e.target.value)}
              label={pointLabel}
            >
              <MenuItem value="all">Any</MenuItem>
              {epochs.map(epoch => (
                <MenuItem key={epoch.epoch_uuid} value={epoch.epoch.toString()}>
                  {pointLabel} {epoch.epoch}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <TextField
          size="small"
          label="Search by Name"
          value={selectedImageName}
          onChange={(e) => setSelectedImageName(e.target.value)}
          placeholder="e.g. image_001"
          sx={{ 
            flexGrow: { xs: 0, sm: 1 },
            minWidth: { xs: '100%', sm: 'auto' }
          }}
        />
        
        {selectedForCompare.length > 0 && (
          <Chip
            label={`${selectedForCompare.length} selected`}
            onDelete={() => setSelectedForCompare([])}
            color="primary"
            variant="outlined"
          />
        )}
      </Stack>
    </Paper>
  );
};

export default VisualizationFilters;
