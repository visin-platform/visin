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
  onCreate: (datasetName: string, downloadUrl?: string, size?: string) => void;
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
  const [datasetSize, setDatasetSize] = useState('');
  const [error, setError] = useState('');

  const handleSetStoragePath = () => {
    if (datasetName.trim()) {
      // A `datasets/` path the backend recognizes and turns into a signed URL
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
    onCreate(datasetName.trim(), downloadUrl.trim() || undefined, datasetSize.trim() || undefined);
  };

  const handleClose = () => {
    if (!loading) {
      setDatasetName('');
      setDownloadUrl('');
      setDatasetSize('');
      setError('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create New Dataset Analysis</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
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
            label="Size (optional)"
            value={datasetSize}
            onChange={(e) => setDatasetSize(e.target.value)}
            disabled={loading}
            placeholder="e.g., 1.2 GB, 500 MB, 2.5 TB"
            helperText="Human-readable size description"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Download URL (optional)"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            disabled={loading}
            placeholder="https://example.com/dataset.zip or datasets/xod_dataset.zip"
            helperText="Direct download link or storage path (e.g., datasets/xod_dataset.zip)"
            sx={{ mb: 1 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSetStoragePath}
              disabled={loading || !datasetName.trim()}
              sx={{ textTransform: 'none' }}
            >
              Use Storage Path
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