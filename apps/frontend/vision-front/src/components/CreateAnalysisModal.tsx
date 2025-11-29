import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography
} from '@mui/material';

interface CreateAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (datasetName: string) => void;
  loading?: boolean;
}

const CreateAnalysisModal: React.FC<CreateAnalysisModalProps> = ({
  open,
  onClose,
  onCreate,
  loading = false
}) => {
  const [datasetName, setDatasetName] = useState('');
  const [error, setError] = useState('');

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
    onCreate(datasetName.trim());
  };

  const handleClose = () => {
    if (!loading) {
      setDatasetName('');
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
          />
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