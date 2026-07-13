import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Tooltip,
  useTheme,
  alpha
} from '@mui/material';
import {
  Delete as DeleteIcon,
  CloudUpload as CloudUploadIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { Epoch } from '../types';
import DeleteConfirmationDialog from './training/DeleteConfirmationDialog';
import UploadResultsDialog from './training/UploadResultsDialog';

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
  isAuthenticated: boolean;
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
  onSetUploadResultsOpen,
  isAuthenticated
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await onFileUpload(files);
  };

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3
        }}>
        <Typography variant="h6" sx={{
          fontWeight: "bold"
        }}>
          Epochs Management
        </Typography>
        <Box>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        {isAuthenticated && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleFileClick}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Epochs'}
          </Button>
        )}
        </Box>
      </Box>
      {/* Status Alerts */}
      {uploadError && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => onSetUploadResultsOpen(true)}>
              View Details
            </Button>
          }
        >
          {uploadError}
        </Alert>
      )}
      {uploadSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => onSetUploadResultsOpen(true)}>
              View Details
            </Button>
          }
        >
          {uploadSuccess}
        </Alert>
      )}
      {/* Epochs Table */}
      <Paper 
        elevation={0} 
        variant="outlined" 
        sx={{ 
          borderRadius: 2, 
          overflow: 'hidden',
          bgcolor: 'background.paper'
        }}
      >
        {epochs.length === 0 ? (
          <Box
            sx={{
              p: 6,
              textAlign: "center"
            }}>
            <Typography variant="h6" gutterBottom sx={{
              color: "text.secondary"
            }}>
              No epochs uploaded yet
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mb: 3
              }}>
              Upload epoch JSON files to visualize training progress and metrics.
            </Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleFileClick}
            >
              Upload First Epoch
            </Button>
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Epoch</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Train Loss</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Val Loss</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Train mIoU</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Val mIoU</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Learning Rate</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Time (s)</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {epochs.map((epoch) => (
                  <TableRow 
                    key={epoch._id} 
                    hover
                    sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                  >
                    <TableCell component="th" scope="row" sx={{ fontWeight: 500 }}>
                      {epoch.epoch}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {formatNumber(epoch.results?.train?.loss)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {formatNumber(epoch.results?.val?.loss)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'primary.main', fontWeight: 500 }}>
                      {formatNumber(epoch.results?.train?.mean_iou)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'success.main', fontWeight: 500 }}>
                      {formatNumber(epoch.results?.val?.mean_iou)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {epoch.learning_rate?.toExponential(2) || '-'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {epoch.epoch_time?.toFixed(2) || '-'}
                    </TableCell>
                    <TableCell align="center">
                      {isAuthenticated && (
                        <Tooltip title="Delete Epoch">
                          <IconButton 
                            size="small" 
                            onClick={() => onDeleteClick(epoch)}
                            sx={{ 
                              color: 'text.secondary',
                              '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteOpen}
        onClose={() => onSetDeleteOpen(false)}
        onConfirm={onConfirmDelete}
        title="Delete Epoch"
        message={`Are you sure you want to delete Epoch ${deleteTarget?.epoch}? This action cannot be undone.`}
        isDeleting={uploading}
      />
      {/* Upload Results Modal */}
      <UploadResultsDialog
        open={uploadResultsOpen}
        onClose={() => onSetUploadResultsOpen(false)}
        results={uploadResults}
      />
    </Box>
  );
};

export default TrainingEpochsTab;