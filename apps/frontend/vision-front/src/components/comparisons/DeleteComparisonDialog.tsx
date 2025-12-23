import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography
} from '@mui/material';

interface DeleteComparisonDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteComparisonDialog: React.FC<DeleteComparisonDialogProps> = ({
  open,
  onClose,
  onConfirm
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Comparison</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete this comparison? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteComparisonDialog;
