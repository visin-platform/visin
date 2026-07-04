import React from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

interface DeleteAnalysisDialogProps {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteAnalysisDialog: React.FC<DeleteAnalysisDialogProps> = ({ open, loading, onCancel, onConfirm }) => (
  <Dialog open={open} onClose={onCancel}>
    <DialogTitle>Delete Analysis</DialogTitle>
    <DialogContent>
      <Typography>Are you sure you want to delete this analysis?</Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>
        {loading ? <CircularProgress size={24} /> : 'Delete'}
      </Button>
    </DialogActions>
  </Dialog>
);

export default DeleteAnalysisDialog;
