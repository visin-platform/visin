import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography
} from '@mui/material';

interface DeleteConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

const DeleteConfigDialog: React.FC<DeleteConfigDialogProps> = ({
  open,
  onClose,
  onConfirm,
  loading
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Config</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete this config? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={loading}
        >
          {loading ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfigDialog;
