import React, { useRef } from 'react';
import {
  Box,
  Paper,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Info as InfoIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { Epoch, EpochMetrics } from '../types';

interface EpochsUploadTabProps {
  epochs: Epoch[];
  uploading: boolean;
  uploadError: string | null;
  uploadSuccess: string | null;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onViewDetails: (epoch: Epoch) => void;
  onDelete: (epoch: Epoch) => void;
}

export const EpochsUploadTab: React.FC<EpochsUploadTabProps> = ({
  epochs,
  uploading,
  uploadError,
  uploadSuccess,
  onFileChange,
  onViewDetails,
  onDelete
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Paper>
      <Box sx={{
        p: 3
      }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2
          }}>
          <Typography variant="h6">
            Epochs
          </Typography>
        </Box>

        {/* Upload Section */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Upload Epoch JSON File
          </Typography>
          {uploadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {uploadError}
            </Alert>
          )}
          {uploadSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {uploadSuccess}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={onFileChange}
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
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              Upload one or more epoch results JSON files
            </Typography>
          </Box>
        </Box>

        {/* Epochs Table */}
        {epochs.length === 0 ? (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
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
                  <TableCell align="right"><strong>Vehicle IoU</strong></TableCell>
                  <TableCell align="right"><strong>Sign IoU</strong></TableCell>
                  <TableCell align="right"><strong>Cyclist IoU</strong></TableCell>
                  <TableCell align="right"><strong>Pedestrian IoU</strong></TableCell>
                  <TableCell align="right"><strong>Learning Rate</strong></TableCell>
                  <TableCell align="right"><strong>Time (s)</strong></TableCell>
                  <TableCell align="center"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {epochs.map((epoch) => (
                  <TableRow key={epoch._id} hover>
                    <TableCell>{epoch.epoch}</TableCell>
                    <TableCell align="right">{epoch.results?.train?.loss?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{epoch.results?.val?.loss?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{epoch.results?.train?.mean_iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{epoch.results?.val?.mean_iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{(epoch.results?.val?.vehicle as EpochMetrics | undefined)?.iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{(epoch.results?.val?.sign as EpochMetrics | undefined)?.iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{(epoch.results?.val?.cyclist as EpochMetrics | undefined)?.iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{(epoch.results?.val?.pedestrian as EpochMetrics | undefined)?.iou?.toFixed(4) || '-'}</TableCell>
                    <TableCell align="right">{epoch.learning_rate?.toExponential(2) || '-'}</TableCell>
                    <TableCell align="right">{epoch.epoch_time?.toFixed(2) || '-'}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="View details">
                        <IconButton size="small" onClick={() => onViewDetails(epoch)}>
                          <InfoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => onDelete(epoch)}>
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
    </Paper>
  );
};

export default EpochsUploadTab;
