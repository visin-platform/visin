import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button
} from '@mui/material';

interface DeleteTrainingDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteTrainingDialog: React.FC<DeleteTrainingDialogProps> = ({
  open,
  onClose,
  onConfirm,
  isDeleting
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle>Delete Training</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete this training? This action cannot be undone.
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

export default DeleteTrainingDialog;
