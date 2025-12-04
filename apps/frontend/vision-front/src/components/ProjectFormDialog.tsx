import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Alert,
  CircularProgress
} from '@mui/material';

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  isEditing: boolean;
  isCreating: boolean;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  isPublic: boolean;
  onIsPublicChange: (value: boolean) => void;
  error: string | null;
  success: string | null;
}

export const ProjectFormDialog: React.FC<ProjectFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isEditing,
  isCreating,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  isPublic,
  onIsPublicChange,
  error,
  success
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Project' : 'Create New Project'}</DialogTitle>
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
          label="Project Name"
          fullWidth
          variant="outlined"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Autonomous Driving Research"
          disabled={isCreating}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !isCreating && name.trim()) {
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
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add a description for this project..."
          disabled={isCreating}
          sx={{ mb: 2 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={isPublic}
              onChange={(e) => onIsPublicChange(e.target.checked)}
              disabled={isCreating}
            />
          }
          label="Public Project (Visible to everyone)"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isCreating || !name.trim()}
        >
          {isCreating ? <CircularProgress size={24} /> : (isEditing ? 'Update' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectFormDialog;
