import React from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface TrashDatasetDialogProps {
  open: boolean;
  datasetName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

/** Asks before a dataset goes to the trash. */
const TrashDatasetDialog: React.FC<TrashDatasetDialogProps> = ({ open, datasetName, busy, error, onClose, onConfirm }) => (
      <Dialog open={open} onClose={busy ? undefined : onClose}>
        <DialogTitle>Move to trash</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Move "{datasetName}" to the trash? It disappears at once, with its labeling jobs. Its owner can restore it
            from the trash for 30 days; after that its zip and images are deleted.
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={onConfirm} disabled={busy}>
            Move to trash
          </Button>
        </DialogActions>
      </Dialog>
);

export default TrashDatasetDialog;
