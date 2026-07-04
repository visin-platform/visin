import React from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

interface EditAnalysisDialogProps {
  open: boolean;
  loading: boolean;
  datasetName: string;
  onDatasetNameChange: (value: string) => void;
  datasetSize: string;
  onDatasetSizeChange: (value: string) => void;
  downloadUrl: string;
  onDownloadUrlChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const EditAnalysisDialog: React.FC<EditAnalysisDialogProps> = ({
  open,
  loading,
  datasetName,
  onDatasetNameChange,
  datasetSize,
  onDatasetSizeChange,
  downloadUrl,
  onDownloadUrlChange,
  onCancel,
  onConfirm
}) => (
  <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
    <DialogTitle>Edit Dataset Name</DialogTitle>
    <DialogContent>
      <TextField
        autoFocus
        margin="dense"
        label="Dataset Name"
        fullWidth
        variant="outlined"
        value={datasetName}
        onChange={(e) => onDatasetNameChange(e.target.value)}
        disabled={loading}
        sx={{ mb: 2 }}
      />
      <TextField
        margin="dense"
        label="Size (optional)"
        fullWidth
        variant="outlined"
        value={datasetSize}
        onChange={(e) => onDatasetSizeChange(e.target.value)}
        disabled={loading}
        placeholder="e.g., 1.2 GB, 500 MB, 2.5 TB"
        helperText="Human-readable size description"
        sx={{ mb: 2 }}
      />
      <TextField
        margin="dense"
        label="Download URL (optional)"
        fullWidth
        variant="outlined"
        value={downloadUrl}
        onChange={(e) => onDownloadUrlChange(e.target.value)}
        disabled={loading}
        placeholder="https://example.com/dataset.zip or datasets/xod_dataset.zip"
        helperText="Direct download link or MinIO bucket path (e.g., datasets/xod_dataset.zip)"
        sx={{ mb: 2 }}
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} disabled={loading}>
        Cancel
      </Button>
      <Button onClick={onConfirm} variant="contained" disabled={loading || !datasetName.trim()}>
        {loading ? <CircularProgress size={24} /> : 'Update'}
      </Button>
    </DialogActions>
  </Dialog>
);

export default EditAnalysisDialog;
