import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button
} from '@mui/material';

interface DeleteMultipleTrainingsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  isDeleting: boolean;
}

const DeleteMultipleTrainingsDialog: React.FC<DeleteMultipleTrainingsDialogProps> = ({
  open,
  onClose,
  onConfirm,
  count,
  isDeleting
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle>Delete Selected Trainings</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete {count} training(s)? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button 
          onClick={onClose} 
          disabled={isDeleting}
          sx={{ borderRadius: 2 }}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={isDeleting}
          sx={{ borderRadius: 2 }}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteMultipleTrainingsDialog;
