import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
  Typography,
  Button,
  alpha,
  useTheme
} from '@mui/material';
import { CloudUpload as CloudUploadIcon, Upload as UploadIcon } from '@mui/icons-material';
import { Epoch } from '../../types';

interface UploadVisualizationDialogProps {
  open: boolean;
  onClose: () => void;
  epochs: Epoch[];
  onUpload: (epoch: string, file: File, type: string) => Promise<boolean>;
  uploading: boolean;
}

const UploadVisualizationDialog: React.FC<UploadVisualizationDialogProps> = ({
  open,
  onClose,
  epochs,
  onUpload,
  uploading
}) => {
  const theme = useTheme();
  const [selectedEpoch, setSelectedEpoch] = useState<string>('');
  const [uploadType, setUploadType] = useState<string>('segment');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUploadClick = async () => {
    if (selectedFile && selectedEpoch && uploadType) {
      const success = await onUpload(selectedEpoch, selectedFile, uploadType);
      if (success) {
        onClose();
        setSelectedFile(null);
        setSelectedEpoch('');
        setUploadType('segment');
      }
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle>Upload Visualization</DialogTitle>
      <DialogContent>
        <Stack spacing={3} mt={1}>
          <FormControl fullWidth>
            <InputLabel>Epoch</InputLabel>
            <Select
              value={selectedEpoch}
              onChange={(e) => setSelectedEpoch(e.target.value)}
              label="Epoch"
            >
              {epochs.map(epoch => (
                <MenuItem key={epoch.epoch_uuid} value={epoch.epoch_uuid}>
                  Epoch {epoch.epoch}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Visualization Type"
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value)}
            placeholder="e.g., segment, overlay, correct_only"
            helperText="Categorize this visualization (e.g., segment, overlay)"
          />

          <Box 
            sx={{ 
              border: `2px dashed ${theme.palette.divider}`,
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              bgcolor: 'background.default',
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.02)
              }
            }}
            component="label"
          >
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={handleFileSelect}
            />
            <CloudUploadIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body1" fontWeight={500} gutterBottom>
              {selectedFile ? selectedFile.name : 'Click to Select Image'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Supports PNG, JPG, JPEG
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button
          onClick={handleUploadClick}
          variant="contained"
          disabled={!selectedFile || !selectedEpoch || !uploadType || uploading}
          startIcon={<UploadIcon />}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UploadVisualizationDialog;
