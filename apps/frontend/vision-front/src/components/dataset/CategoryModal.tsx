import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField
} from '@mui/material';

interface CategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  isEditing: boolean;
  form: { name: string; description: string; color: string };
  setForm: (form: { name: string; description: string; color: string }) => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({
  open,
  onClose,
  onSave,
  isEditing,
  form,
  setForm
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit Category' : 'Create New Category'}
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Category Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          sx={{ mt: 2 }}
          required
          helperText="Enter a unique name for this category"
        />
        <TextField
          fullWidth
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          sx={{ mt: 2 }}
          multiline
          rows={3}
          helperText="Optional description for this category"
        />
        <TextField
          fullWidth
          label="Color"
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          sx={{ mt: 2 }}
          helperText="Choose a color to visually identify this category"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={!form.name.trim()}
        >
          {isEditing ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategoryModal;
