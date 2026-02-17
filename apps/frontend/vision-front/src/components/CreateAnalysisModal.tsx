import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box
} from '@mui/material';

interface CreateAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (datasetName: string, downloadUrl?: string) => void;
  loading?: boolean;
}

const CreateAnalysisModal: React.FC<CreateAnalysisModalProps> = ({
  open,
  onClose,
  onCreate,
  loading = false
}) => {
  const [datasetName, setDatasetName] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');

  const handleSetMinioUrl = () => {
    if (datasetName.trim()) {
      // Set a MinIO path that the backend will recognize and generate signed URL for
      setDownloadUrl(`datasets/${datasetName.trim()}_dataset.zip`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!datasetName.trim()) {
      setError('Dataset name is required');
      return;
    }

    if (datasetName.trim().length < 2) {
      setError('Dataset name must be at least 2 characters');
      return;
    }

    setError('');
    onCreate(datasetName.trim(), downloadUrl.trim() || undefined);
  };

  const handleClose = () => {
    if (!loading) {
      setDatasetName('');
      setDownloadUrl('');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create New Dataset Analysis</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter a name for your dataset (e.g., "waymo", "zod", "custom-dataset").
            You can then upload JSON analysis data and example images.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Dataset Name"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            error={!!error}
            helperText={error}
            disabled={loading}
            placeholder="e.g., waymo, zod, custom-dataset"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Download URL (optional)"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            disabled={loading}
            placeholder="https://example.com/dataset.zip or datasets/xod_dataset.zip"
            helperText="Direct download link or MinIO bucket path (e.g., datasets/xod_dataset.zip)"
            sx={{ mb: 1 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSetMinioUrl}
              disabled={loading || !datasetName.trim()}
              sx={{ textTransform: 'none' }}
            >
              Use MinIO Path
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !datasetName.trim()}
          >
            {loading ? 'Creating...' : 'Create Analysis'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateAnalysisModal;