import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Button,
  Box
} from '@mui/material';

interface EditProjectDialogProps {
  open: boolean;
  onClose: () => void;
  formData: {
    name: string;
    description: string;
    isPublic: boolean;
  };
  onFormDataChange: (data: { name: string; description: string; isPublic: boolean }) => void;
  onSubmit: () => void;
  isUpdating: boolean;
}

const EditProjectDialog: React.FC<EditProjectDialogProps> = ({
  open,
  onClose,
  formData,
  onFormDataChange,
  onSubmit,
  isUpdating
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Project</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Project Name"
            value={formData.name}
            onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
            fullWidth
            required
          />
          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />
          <FormControlLabel
            control={
              <Switch
                checked={formData.isPublic}
                onChange={(e) => onFormDataChange({ ...formData, isPublic: e.target.checked })}
              />
            }
            label="Public project"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isUpdating || !formData.name.trim()}
        >
          {isUpdating ? 'Updating...' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditProjectDialog;