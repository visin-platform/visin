import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  TextField,
  Typography
} from '@mui/material';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';

interface DatasetUploadDialogProps {
  open: boolean;
  loading: boolean;
  title: string;
  submitLabel: string;
  /** Pre-fills the name field when editing an existing dataset. */
  initialName?: string;
  /** Creating a dataset needs a file; replacing the archive of one is optional. */
  fileRequired?: boolean;
  /**
   * Archive upload progress as a 0–1 fraction, or null when no upload is in
   * flight. Multi-GB dataset zips go up in chunks over several minutes, so a
   * bare spinner leaves no way to tell a slow upload from a stalled one.
   */
  uploadProgress?: number | null;
  onCancel: () => void;
  onSubmit: (datasetName: string, file?: File) => void;
}

const formatFileSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

/** Falls back to the archive's own name so uploading is a one-click affair. */
const nameFromFile = (file: File): string => file.name.replace(/\.[^.]+$/, '');

const DatasetUploadDialog: React.FC<DatasetUploadDialogProps> = ({
  open,
  loading,
  title,
  submitLabel,
  initialName = '',
  fileRequired = false,
  uploadProgress = null,
  onCancel,
  onSubmit
}) => {
  const [datasetName, setDatasetName] = useState(initialName);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The dialog stays mounted between openings, so each one starts clean.
  useEffect(() => {
    if (open) {
      setDatasetName(initialName);
      setFile(null);
      setError('');
    }
  }, [open, initialName]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setError('');
    if (!datasetName.trim()) {
      setDatasetName(nameFromFile(selected));
    }
    // Reset so re-picking the same file still fires a change event.
    event.target.value = '';
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (fileRequired && !file) {
      setError('Choose a dataset file to upload');
      return;
    }

    const name = datasetName.trim() || (file ? nameFromFile(file) : '');
    if (name.length < 2) {
      setError('Dataset name must be at least 2 characters');
      return;
    }

    setError('');
    onSubmit(name, file || undefined);
  };

  // A finished upload (fraction 1) is no longer "uploading" — the request to
  // create the record is still outstanding, which the indeterminate bar covers.
  const uploadingBytes = uploadProgress !== null && uploadProgress < 1;
  const percent = Math.round((uploadProgress ?? 0) * 100);

  const handleCancel = () => {
    if (!loading) {
      onCancel();
    }
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {fileRequired
              ? 'Upload your dataset archive. Its size and download link are set automatically.'
              : 'Rename the dataset, and optionally replace its archive with a new upload.'}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            fullWidth
            sx={{ mb: 1, py: 1.5, textTransform: 'none' }}
          >
            {file ? 'Choose a different file' : fileRequired ? 'Choose dataset file' : 'Replace dataset file'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/x-tar,application/gzip"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            data-testid="dataset-file-input"
          />
          <Box sx={{ mb: 2, minHeight: 24 }}>
            {file && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {file.name} — {formatFileSize(file.size)}
              </Typography>
            )}
          </Box>
          {loading && file && (
            <Box sx={{ mb: 2 }} data-testid="upload-progress">
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {uploadingBytes ? 'Uploading archive…' : 'Creating dataset…'}
                </Typography>
                {uploadingBytes && (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {percent}% of {formatFileSize(file.size)}
                  </Typography>
                )}
              </Box>
              {/* Indeterminate once the bytes are up: the backend is still
                  unpacking the archive, and there is nothing left to count. */}
              <LinearProgress
                variant={uploadingBytes ? 'determinate' : 'indeterminate'}
                value={uploadingBytes ? percent : undefined}
                sx={{ borderRadius: 1, height: 6 }}
              />
            </Box>
          )}
          <TextField
            fullWidth
            label="Dataset Name"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            error={!!error}
            helperText={error || 'Defaults to the uploaded file name'}
            disabled={loading}
            placeholder="e.g., waymo, zod, custom-dataset"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default DatasetUploadDialog;
