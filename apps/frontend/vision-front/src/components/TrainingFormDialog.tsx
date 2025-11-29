import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  MenuItem,
  Alert,
  CircularProgress,
  Typography,
  Box
} from '@mui/material';
import { Config, Training } from '../types';
import { DatasetAnalysis } from '../services/analysisService';
import TagInput from './TagInput';

interface TrainingFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  isEditing: boolean;
  isCreating: boolean;
  isLoadingData: boolean;
  trainingName: string;
  onNameChange: (value: string) => void;
  trainingDescription: string;
  onDescriptionChange: (value: string) => void;
  selectedConfigId: string;
  onConfigChange: (value: string) => void;
  selectedDatasetId: string;
  onDatasetChange: (value: string) => void;
  selectedStatus: Training['status'];
  onStatusChange: (value: Training['status']) => void;
  trainingTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags?: string[];
  configs: Config[];
  datasets: DatasetAnalysis[];
  error: string | null;
  success: string | null;
  loadingConfigs: boolean;
  loadingDatasets: boolean;
}

export const TrainingFormDialog: React.FC<TrainingFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isEditing,
  isCreating,
  isLoadingData,
  trainingName,
  onNameChange,
  trainingDescription,
  onDescriptionChange,
  selectedConfigId,
  onConfigChange,
  selectedDatasetId,
  onDatasetChange,
  selectedStatus,
  onStatusChange,
  trainingTags,
  onTagsChange,
  availableTags = [],
  configs,
  datasets,
  error,
  success,
  loadingConfigs,
  loadingDatasets
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Training' : 'Create New Training'}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}
        <TextField
          autoFocus
          margin="dense"
          label="Training Name"
          fullWidth
          variant="outlined"
          value={trainingName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Waymo Dataset Training"
          disabled={isCreating || isLoadingData}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !isCreating && trainingName.trim()) {
              onSubmit();
            }
          }}
          sx={{ mb: 2 }}
        />
        <TextField
          margin="dense"
          label="Description (Optional)"
          fullWidth
          multiline
          rows={3}
          variant="outlined"
          value={trainingDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add a description for this training..."
          disabled={isCreating || isLoadingData}
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Select Config (Optional)</InputLabel>
          <Select
            value={selectedConfigId}
            onChange={(e: SelectChangeEvent<string>) => onConfigChange(e.target.value)}
            label="Select Config (Optional)"
            disabled={isCreating || isLoadingData || loadingConfigs}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {configs.map((config: Config) => (
              <MenuItem key={config._id} value={config._id}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {config.config_name || 'Unnamed'}
                  </Typography>
                  {config.summary && (
                    <Typography variant="caption" color="text.secondary">
                      {config.summary}
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Select Dataset Analysis (Optional)</InputLabel>
          <Select
            value={selectedDatasetId}
            onChange={(e: SelectChangeEvent<string>) => onDatasetChange(e.target.value)}
            label="Select Dataset Analysis (Optional)"
            disabled={isCreating || isLoadingData || loadingDatasets}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {datasets.map((dataset: DatasetAnalysis) => (
              <MenuItem key={dataset._id} value={dataset._id}>
                {dataset.dataset} ({dataset.data?.total_frames || 0} frames, {dataset.data?.total_classes || 0} classes)
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={selectedStatus}
            onChange={(e: SelectChangeEvent<string>) => onStatusChange(e.target.value as Training['status'])}
            label="Status"
            disabled={isCreating || isLoadingData}
          >
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="running">Running</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ mb: 2 }}>
          <TagInput
            tags={trainingTags}
            onTagsChange={onTagsChange}
            availableTags={availableTags}
            label="Tags (Optional)"
            placeholder="Add tags to categorize this training..."
            maxTags={5}
          />
        </Box>
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 2 }}>
          A unique UUID will be automatically generated for this training. You can select a dataset analysis and/or config. After creating, you can upload epoch JSON files to track training progress.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isCreating || isLoadingData}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isCreating || isLoadingData || !trainingName.trim()}
        >
          {isCreating ? <CircularProgress size={24} /> : (isEditing ? 'Update' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TrainingFormDialog;
