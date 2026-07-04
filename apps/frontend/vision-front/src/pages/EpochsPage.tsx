import React, { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Typography,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { epochService } from '../services/epochService';
import { trainingService } from '../services/trainingService';
import { usePageTitle } from '../hooks/usePageTitle';
import { Epoch, Training } from '../types';

export const EpochsPage: React.FC = () => {
  const location = useLocation();

  // Set page title
  usePageTitle('Epochs - Vision');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraining, setSelectedTraining] = useState<string>('');
  const [selectedEpoch, setSelectedEpoch] = useState<Epoch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Epoch | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Check if navigation state contains a training ID
    const state = location.state as any;
    if (state?.trainingId) {
      setSelectedTraining(state.trainingId);
    }
  }, [location.state]);

  const { data: trainingsData, isLoading: loadingTrainings } = useQuery({
    queryKey: ['trainings', { limit: 100 }],
    queryFn: () => trainingService.getTrainings({ limit: 100 })
  });

  const trainings: Training[] = trainingsData?.data.trainings || [];

  const {
    data: epochsData,
    isLoading: loadingEpochs
  } = useQuery({
    queryKey: ['epochs', selectedTraining],
    queryFn: () =>
      epochService.getEpochsByTraining(selectedTraining, {
        limit: 1000,
        sortBy: 'epoch',
        order: 'asc'
      }),
    enabled: !!selectedTraining
  });

  const epochs: Epoch[] = epochsData?.data.epochs || [];
  const loading = loadingTrainings || loadingEpochs;

  const uploadMutation = useMutation({
    mutationFn: (data: unknown) => epochService.uploadEpoch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epochs', selectedTraining] });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to upload epoch');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => epochService.deleteEpoch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['epochs', selectedTraining] });
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete epoch');
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  });

  const uploading = uploadMutation.isPending;
  const success = uploadMutation.isSuccess ? 'Epoch uploaded successfully!' : deleteMutation.isSuccess ? 'Epoch deleted successfully' : null;

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file is JSON
    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }

    setError(null);
    // Read file content
    const content = await file.text();
    const data = JSON.parse(content);
    uploadMutation.mutate(data);
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
    deleteMutation.mutate(deleteTarget._id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        Training Epochs
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* Upload Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Upload Epoch JSON File
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 2, alignItems: 'flex-end' }}>
            <FormControl fullWidth>
              <InputLabel>Select Training</InputLabel>
              <Select
                value={selectedTraining}
                onChange={(e) => setSelectedTraining(e.target.value)}
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

            <Box sx={{ display: 'flex', gap: 2 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <Button
                variant="contained"
                onClick={handleFileClick}
                disabled={uploading || !selectedTraining}
              >
                {uploading ? <CircularProgress size={24} /> : 'Select File'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Epochs Table */}
      {selectedTraining && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Epochs for {trainings.find((t) => t._id === selectedTraining)?.name}
            </Typography>

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : epochs.length === 0 ? (
              <Typography color="textSecondary">No epochs found for this training</Typography>
            ) : (
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell>
                        <strong>Epoch #</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Loss (Train)</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Loss (Val)</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>mIoU (Train)</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>mIoU (Val)</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Learning Rate</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Time (s)</strong>
                      </TableCell>
                      <TableCell align="center">
                        <strong>Actions</strong>
                      </TableCell>
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
          </CardContent>
        </Card>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Epoch Details - Epoch {selectedEpoch?.epoch}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {selectedEpoch && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              {/* Overview */}
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
                    <strong>Timestamp:</strong> {formatDate(selectedEpoch.timestamp)}
                  </Typography>
                </Box>
              </Box>

              {/* Training Results */}
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
                    {Object.entries(selectedEpoch.results.train).map(([key, value]) => {
                      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        const metrics = value as any;
                        return (
                          <Box key={key} sx={{ gridColumn: '1 / -1' }}>
                            <Typography variant="body2" sx={{ ml: 1 }}>
                              <strong>{key}:</strong>
                            </Typography>
                            <Box sx={{ ml: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              {Object.entries(metrics).map(([m, v]) => (
                                <Typography key={m} variant="caption">
                                  {m}: {typeof v === 'number' ? (v as number).toFixed(4) : String(v)}
                                </Typography>
                              ))}
                            </Box>
                          </Box>
                        );
                      }
                      return null;
                    })}
                  </Box>
                </Box>
              )}

              {/* Validation Results */}
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
                    {Object.entries(selectedEpoch.results.val).map(([key, value]) => {
                      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        const metrics = value as any;
                        return (
                          <Box key={key} sx={{ gridColumn: '1 / -1' }}>
                            <Typography variant="body2" sx={{ ml: 1 }}>
                              <strong>{key}:</strong>
                            </Typography>
                            <Box sx={{ ml: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              {Object.entries(metrics).map(([m, v]) => (
                                <Typography key={m} variant="caption">
                                  {m}: {typeof v === 'number' ? (v as number).toFixed(4) : String(v)}
                                </Typography>
                              ))}
                            </Box>
                          </Box>
                        );
                      }
                      return null;
                    })}
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
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EpochsPage;
