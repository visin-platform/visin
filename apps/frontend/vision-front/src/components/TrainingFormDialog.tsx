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
  Box,
  Chip,
  FormHelperText,
  Link
} from '@mui/material';
import { Training } from '../types';
import type { DatasetReference } from '../types/training';
import { Project } from '../types/Project';
import TagInput from './TagInput';

const DATASET_SOURCE_LABEL: Record<DatasetReference['source'], string> = {
  visin: 'Visin dataset',
  hf: 'Hugging Face Hub',
  other: 'Named only'
};

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
  /**
   * The run's dataset, shown and never edited: the reporting pipeline sets it with the run, and it cannot be
   * reassigned afterwards. `datasetId` is for a run that recorded only an id.
   */
  dataset?: DatasetReference;
  datasetId?: string;
  selectedProjectId: string;
  onProjectChange: (value: string) => void;
  selectedStatus: Training['status'];
  onStatusChange: (value: Training['status']) => void;
  trainingTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags?: string[];
  projects: Project[];
  error: string | null;
  success: string | null;
  loadingProjects: boolean;
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
  dataset,
  datasetId,
  selectedProjectId,
  onProjectChange,
  selectedStatus,
  onStatusChange,
  trainingTags,
  onTagsChange,
  availableTags = [],
  projects,
  error,
  success,
  loadingProjects
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
            if (e.key === 'Enter' && !isCreating && !isLoadingData && selectedProjectId && trainingName.trim()) {
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
        <FormControl fullWidth required sx={{ mb: 2 }}>
          <InputLabel>Select Project</InputLabel>
          <Select
            value={selectedProjectId}
            onChange={(e: SelectChangeEvent<string>) => onProjectChange(e.target.value)}
            label="Select Project"
            disabled={isEditing || isCreating || isLoadingData || loadingProjects}
          >
            {projects.map((project: Project) => (
              <MenuItem key={project._id} value={project._id}>
                {project.name}
              </MenuItem>
            ))}
          </Select>
          {isEditing && <FormHelperText>Project cannot be changed after creation.</FormHelperText>}
        </FormControl>
        {isEditing && (dataset || datasetId) && (
          // Not a field: a dataset is fixed when the run is reported, so it is shown as a fact about the run.
          <Box
            component="section"
            aria-label="Dataset"
            sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Dataset
            </Typography>
            {dataset ? (
              <>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {dataset.source === 'visin' && dataset.id ? (
                    <Link href={`/datasets/${dataset.id}`}>{dataset.name}</Link>
                  ) : (
                    dataset.name
                  )}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                  <Chip size="small" variant="outlined" label={DATASET_SOURCE_LABEL[dataset.source]} />
                  {dataset.revision && <Chip size="small" variant="outlined" label={`Revision ${dataset.revision}`} />}
                </Box>
              </>
            ) : (
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                A dataset recorded by its id only: {datasetId}
              </Typography>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
              Fixed when the run was reported. A dataset cannot be changed after training.
            </Typography>
          </Box>
        )}
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
            <MenuItem value="stalled">Stalled</MenuItem>
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
          The training&apos;s dataset and config are set by the pipeline that reports it and cannot be changed here:
          the config is on the Config tab.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isCreating || isLoadingData}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isCreating || isLoadingData || !trainingName.trim() || !selectedProjectId}
        >
          {isCreating ? <CircularProgress size={24} /> : isEditing ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TrainingFormDialog;
