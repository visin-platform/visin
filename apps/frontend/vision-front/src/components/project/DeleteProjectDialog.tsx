import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Alert, Button } from '@mui/material';

interface DeleteProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  error?: string;
}

const DeleteProjectDialog: React.FC<DeleteProjectDialogProps> = ({ open, onClose, onConfirm, isDeleting, error }) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Project</DialogTitle>
      <DialogContent>
        <Typography>
          Move this project and its trainings to the trash? Its owner can restore them for 30 days. After that they are
          permanently deleted.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteProjectDialog;
