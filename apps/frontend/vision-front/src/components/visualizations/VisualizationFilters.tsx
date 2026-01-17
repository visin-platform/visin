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
}

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
  setSelectedForCompare
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box display="flex" alignItems="center" color="text.secondary" sx={{ minWidth: { xs: 'auto', sm: 'fit-content' } }}>
          <FilterListIcon sx={{ mr: 1 }} />
          <Typography variant="subtitle2" fontWeight={600}>Filters:</Typography>
        </Box>
        
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 } }}>
          <InputLabel>Type</InputLabel>
          <Select
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

        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 150 } }}>
          <InputLabel>Epoch</InputLabel>
          <Select
            value={selectedEpochFilter}
            onChange={(e) => setSelectedEpochFilter(e.target.value)}
            label="Epoch"
          >
            <MenuItem value="all">All Epochs</MenuItem>
            {epochs.map(epoch => (
              <MenuItem key={epoch.epoch_uuid} value={epoch.epoch.toString()}>
                Epoch {epoch.epoch}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
