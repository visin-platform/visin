import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography
} from '@mui/material';

interface DeleteMultipleConfigsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  loading: boolean;
}

const DeleteMultipleConfigsDialog: React.FC<DeleteMultipleConfigsDialogProps> = ({
  open,
  onClose,
  onConfirm,
  count,
  loading
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
    >
      <DialogTitle>Delete Selected Configs</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete {count} config(s)? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
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

export default DeleteMultipleConfigsDialog;
