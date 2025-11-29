import React, { useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { epochService } from '../services/epochService';
import { Epoch, Training } from '../types';

interface EpochUploadTabProps {
  trainings: Training[];
  selectedTrainingId: string;
  onTrainingChange: (trainingId: string) => void;
}

export const EpochUploadTab: React.FC<EpochUploadTabProps> = ({
  trainings,
  selectedTrainingId,
  onTrainingChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [epochs, setEpochs] = useState<Epoch[]>([]);
  const [selectedEpoch, setSelectedEpoch] = useState<Epoch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Epoch | null>(null);
  const [uploadResultsOpen, setUploadResultsOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<{
    successful: string[];
    failed: string[];
  }>({ successful: [], failed: [] });

  // Load epochs when training changes
  React.useEffect(() => {
    if (selectedTrainingId) {
      loadEpochs();
    }
  }, [selectedTrainingId]);

  const loadEpochs = async () => {
    if (!selectedTrainingId) return;

    try {
      setLoading(true);
      setUploadError(null);
      const response = await epochService.getEpochsByTraining(selectedTrainingId, {
        limit: 1000,
        sortBy: 'epoch',
        order: 'asc'
      });
      setEpochs(response.data.epochs || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load epochs';
      setUploadError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const successfulFiles: string[] = [];
      const failedFiles: string[] = [];

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validate file is JSON
        if (!file.name.endsWith('.json')) {
          failedFiles.push(file.name);
          continue;
        }

        try {
          // Read file content
          const content = await file.text();
          const epochData = JSON.parse(content);

          // Upload to API with current training ID
          await epochService.uploadEpoch(epochData, selectedTrainingId);
          successfulFiles.push(file.name);
        } catch (err) {
          failedFiles.push(file.name);
        }
      }

      // Set results for modal
      setUploadResults({
        successful: successfulFiles,
        failed: failedFiles
      });

      // Build success/error message with counts only
      if (successfulFiles.length > 0) {
        setUploadSuccess(`${successfulFiles.length} epoch file(s) uploaded successfully!`);
      }

      if (failedFiles.length > 0) {
        setUploadError(`Failed to upload ${failedFiles.length} file(s).`);
      }

      loadEpochs();

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Clear messages after 5 seconds
      setTimeout(() => {
        setUploadSuccess(null);
        setUploadError(null);
      }, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload epochs';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleViewDetails = (epoch: Epoch) => {
    setSelectedEpoch(epoch);
    setDetailsOpen(true);
  };

  const handleDeleteClick = (epoch: Epoch) => {
    setDeleteTarget(epoch);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setLoading(true);
      await epochService.deleteEpoch(deleteTarget._id);
      setUploadSuccess('Epoch deleted successfully');
      loadEpochs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete epoch';
      setUploadError(message);
    } finally {
      setLoading(false);
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  const selectedTraining = trainings.find(t => t._id === selectedTrainingId);

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  return (
    <Box sx={{ py: 2 }}>
      <Paper sx={{ p: 3 }}>
        <Box display="grid" gridTemplateColumns="1fr 1fr auto" gap={2} alignItems="flex-end" mb={3}>
          <FormControl fullWidth>
            <InputLabel>Select Training</InputLabel>
            <Select
              value={selectedTrainingId}
              onChange={(e) => onTrainingChange(e.target.value)}
              label="Select Training"
              disabled={loading}
            >
              <MenuItem value="">
                <em>Choose a training</em>
              </MenuItem>
              {trainings.map((training) => (
                <MenuItem key={training._id} value={training._id}>
                  {training.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1 }}>
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
              disabled={uploading || !selectedTrainingId}
            >
              {uploading ? 'Uploading...' : 'Select JSON Files'}
            </Button>
            <IconButton
              onClick={loadEpochs}
              disabled={loading || !selectedTrainingId}
              title="Refresh epochs"
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {uploadError && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              uploadResults.failed.length > 0 ? (
                <IconButton
                  size="small"
                  onClick={() => setUploadResultsOpen(true)}
                  sx={{ color: 'inherit' }}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              ) : undefined
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
              uploadResults.successful.length > 0 ? (
                <IconButton
                  size="small"
                  onClick={() => setUploadResultsOpen(true)}
                  sx={{ color: 'inherit' }}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              ) : undefined
            }
          >
            {uploadSuccess}
          </Alert>
        )}

        {selectedTrainingId && (
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
              Epochs for {selectedTraining?.name}
            </Typography>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : epochs.length === 0 ? (
              <Typography color="textSecondary">
                No epochs uploaded for this training yet. Upload JSON files to get started.
              </Typography>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell><strong>Epoch #</strong></TableCell>
                      <TableCell align="right"><strong>Loss (Train)</strong></TableCell>
                      <TableCell align="right"><strong>Loss (Val)</strong></TableCell>
                      <TableCell align="right"><strong>mIoU (Train)</strong></TableCell>
                      <TableCell align="right"><strong>mIoU (Val)</strong></TableCell>
                      <TableCell align="right"><strong>Learning Rate</strong></TableCell>
                      <TableCell align="right"><strong>Time (s)</strong></TableCell>
                      <TableCell align="center"><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {epochs.map((epoch) => {
                      const trainLoss = epoch.results?.train?.loss;
                      const valLoss = epoch.results?.val?.loss;
                      const trainMiou = epoch.results?.train?.mean_iou;
                      const valMiou = epoch.results?.val?.mean_iou;

                      return (
                        <TableRow key={epoch._id} hover>
                          <TableCell>{epoch.epoch}</TableCell>
                          <TableCell align="right">{formatNumber(trainLoss)}</TableCell>
                          <TableCell align="right">{formatNumber(valLoss)}</TableCell>
                          <TableCell align="right">{formatNumber(trainMiou)}</TableCell>
                          <TableCell align="right">{formatNumber(valMiou)}</TableCell>
                          <TableCell align="right">
                            {epoch.learning_rate ? epoch.learning_rate.toExponential(2) : '-'}
                          </TableCell>
                          <TableCell align="right">{epoch.epoch_time?.toFixed(1) || '-'}</TableCell>
                          <TableCell align="center">
                            <Tooltip title="View details">
                              <IconButton size="small" onClick={() => handleViewDetails(epoch)}>
                                <InfoIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" onClick={() => handleDeleteClick(epoch)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Paper>

      {/* Epoch Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Epoch Details - Epoch {selectedEpoch?.epoch}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {selectedEpoch && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Overview
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pl: 2 }}>
                  <Typography variant="body2">
                    <strong>Epoch UUID:</strong> {selectedEpoch.epoch_uuid}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Learning Rate:</strong> {selectedEpoch.learning_rate?.toExponential(2)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Epoch Time:</strong> {selectedEpoch.epoch_time?.toFixed(2)}s
                  </Typography>
                  <Typography variant="body2">
                    <strong>Timestamp:</strong> {new Date(selectedEpoch.timestamp).toLocaleString()}
                  </Typography>
                </Box>
              </Box>

              {selectedEpoch.results?.train && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Training Results
                  </Typography>
                  <Box sx={{ pl: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Typography variant="body2">
                      <strong>Loss:</strong> {formatNumber(selectedEpoch.results.train.loss)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>mIoU:</strong> {formatNumber(selectedEpoch.results.train.mean_iou)}
                    </Typography>
                  </Box>
                </Box>
              )}

              {selectedEpoch.results?.val && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Validation Results
                  </Typography>
                  <Box sx={{ pl: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <Typography variant="body2">
                      <strong>Loss:</strong> {formatNumber(selectedEpoch.results.val.loss)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>mIoU:</strong> {formatNumber(selectedEpoch.results.val.mean_iou)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Epoch</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete Epoch {deleteTarget?.epoch}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={loading}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Results Modal */}
      <Dialog 
        open={uploadResultsOpen} 
        onClose={() => setUploadResultsOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>Upload Results</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'grid', gap: 3 }}>
            {uploadResults.successful.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'success.main' }}>
                  Successfully Uploaded ({uploadResults.successful.length})
                </Typography>
                <Box 
                  sx={{ 
                    maxHeight: 200, 
                    overflow: 'auto', 
                    border: 1, 
                    borderColor: 'success.light', 
                    borderRadius: 1, 
                    p: 1 
                  }}
                >
                  {uploadResults.successful.map((file, index) => (
                    <Typography key={index} variant="body2" sx={{ color: 'success.main' }}>
                      • {file}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}

            {uploadResults.failed.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'error.main' }}>
                  Failed to Upload ({uploadResults.failed.length})
                </Typography>
                <Box 
                  sx={{ 
                    maxHeight: 200, 
                    overflow: 'auto', 
                    border: 1, 
                    borderColor: 'error.light', 
                    borderRadius: 1, 
                    p: 1 
                  }}
                >
                  {uploadResults.failed.map((file, index) => (
                    <Typography key={index} variant="body2" sx={{ color: 'error.main' }}>
                      • {file}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadResultsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EpochUploadTab;
