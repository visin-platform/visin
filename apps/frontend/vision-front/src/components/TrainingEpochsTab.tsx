import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  CloudUpload as CloudUploadIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { Epoch } from '../types';

interface TrainingEpochsTabProps {
  epochs: Epoch[];
  uploading: boolean;
  uploadError: string | null;
  uploadSuccess: string | null;
  deleteOpen: boolean;
  deleteTarget: Epoch | null;
  uploadResultsOpen: boolean;
  uploadResults: {
    successful: Array<{ name: string; operation: string }>;
    failed: Array<{ name: string; error: string }>;
  };
  onFileUpload: (files: FileList) => Promise<void>;
  onDeleteClick: (epoch: Epoch) => void;
  onConfirmDelete: () => Promise<void>;
  onSetDeleteOpen: (open: boolean) => void;
  onSetUploadResultsOpen: (open: boolean) => void;
}

const TrainingEpochsTab: React.FC<TrainingEpochsTabProps> = ({
  epochs,
  uploading,
  uploadError,
  uploadSuccess,
  deleteOpen,
  deleteTarget,
  uploadResultsOpen,
  uploadResults,
  onFileUpload,
  onDeleteClick,
  onConfirmDelete,
  onSetDeleteOpen,
  onSetUploadResultsOpen
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await onFileUpload(files);
  };

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  return (
    <Paper>
      <Box p={3}>
        <Typography variant="h6" gutterBottom>Epochs Management</Typography>
        <Divider sx={{ mb: 3 }} />

        {/* Upload Section */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Upload Epoch JSON Files
          </Typography>
          {uploadError && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <IconButton
                  size="small"
                  color="inherit"
                  onClick={() => onSetUploadResultsOpen(true)}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              }
            >
              {uploadError}
            </Alert>
          )}
          {uploadSuccess && (
            <Alert
              severity="success"
              sx={{ mb: 2 }}
              action={
                <IconButton
                  size="small"
                  color="inherit"
                  onClick={() => onSetUploadResultsOpen(true)}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              }
            >
              {uploadSuccess}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <Button
              variant="contained"
              startIcon={<CloudUploadIcon />}
              onClick={handleFileClick}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Select JSON Files'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Upload one or more epoch results JSON files
            </Typography>
          </Box>
        </Box>

        {/* Epochs Table */}
        {epochs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No epochs uploaded yet. Upload an epoch JSON file to get started.
          </Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Epoch</strong></TableCell>
                  <TableCell align="right"><strong>Train Loss</strong></TableCell>
                  <TableCell align="right"><strong>Val Loss</strong></TableCell>
                  <TableCell align="right"><strong>Train mIoU</strong></TableCell>
                  <TableCell align="right"><strong>Val mIoU</strong></TableCell>
                  <TableCell align="right"><strong>Learning Rate</strong></TableCell>
                  <TableCell align="right"><strong>Time (s)</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {epochs.map((epoch) => (
                  <TableRow key={epoch._id} hover>
                    <TableCell>{epoch.epoch}</TableCell>
                    <TableCell align="right">{formatNumber(epoch.results?.train?.loss)}</TableCell>
                    <TableCell align="right">{formatNumber(epoch.results?.val?.loss)}</TableCell>
                    <TableCell align="right">{formatNumber(epoch.results?.train?.mean_iou)}</TableCell>
                    <TableCell align="right">{formatNumber(epoch.results?.val?.mean_iou)}</TableCell>
                    <TableCell align="right">{epoch.learning_rate?.toExponential(2) || '-'}</TableCell>
                    <TableCell align="right">{epoch.epoch_time?.toFixed(2) || '-'}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => onDeleteClick(epoch)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => onSetDeleteOpen(false)}>
        <DialogTitle>Delete Epoch</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete Epoch {deleteTarget?.epoch}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onSetDeleteOpen(false)}>Cancel</Button>
          <Button onClick={onConfirmDelete} color="error" variant="contained" disabled={uploading}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Results Modal */}
      <Dialog open={uploadResultsOpen} onClose={() => onSetUploadResultsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Upload Results</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Successful Files */}
            {uploadResults.successful.length > 0 && (
              <Box>
                <Typography variant="h6" color="success.main" gutterBottom>
                  Successfully Processed ({uploadResults.successful.length})
                </Typography>
                <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'success.light', borderRadius: 1, p: 1 }}>
                  {uploadResults.successful.map((file, index) => (
                    <Typography key={index} variant="body2" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{file.name}</span>
                      <span style={{ color: 'green', fontWeight: 'bold' }}>({file.operation})</span>
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {/* Failed Files */}
            {uploadResults.failed.length > 0 && (
              <Box>
                <Typography variant="h6" color="error.main" gutterBottom>
                  Failed to Process ({uploadResults.failed.length})
                </Typography>
                <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'error.light', borderRadius: 1, p: 1 }}>
                  {uploadResults.failed.map((file, index) => (
                    <Box key={index} sx={{ mb: 1 }}>
                      <Typography variant="body2" fontWeight="bold">
                        {file.name}
                      </Typography>
                      <Typography variant="body2" color="error.main" sx={{ ml: 2 }}>
                        {file.error}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onSetUploadResultsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default TrainingEpochsTab;