import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField
} from '@mui/material';
import {
  Upload as UploadIcon,
  Delete as DeleteIcon,
  CompareArrows as CompareIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { visualizationService } from '../services/visualizationService';
import { Visualization, Epoch } from '../types';

interface TrainingVisualizationsTabProps {
  training_uuid: string;
  epochs: Epoch[];
}

const TrainingVisualizationsTab: React.FC<TrainingVisualizationsTabProps> = ({
  training_uuid,
  epochs
}) => {
  const [visualizations, setVisualizations] = useState<Visualization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedEpochFilter, setSelectedEpochFilter] = useState<string>('all');
  const [selectedImageName, setSelectedImageName] = useState<string>('');
  const [types, setTypes] = useState<string[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedEpoch, setSelectedEpoch] = useState<string>('');
  const [uploadType, setUploadType] = useState<string>('segment');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Visualization[]>([]);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Visualization | null>(null);

  // Load visualizations
  const loadVisualizations = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await visualizationService.getVisualizationsByTraining(
        training_uuid,
        {
          type: selectedType !== 'all' ? selectedType : undefined,
          limit: 100
        }
      );

      let visualizations = response.data.visualizations || [];

      // Apply client-side filters
      if (selectedEpochFilter !== 'all') {
        const epochNum = parseInt(selectedEpochFilter);
        visualizations = visualizations.filter((viz: Visualization) => viz.epoch === epochNum);
      }

      if (selectedImageName.trim()) {
        const searchTerm = selectedImageName.toLowerCase().trim();
        visualizations = visualizations.filter((viz: Visualization) =>
          viz.filename.toLowerCase().includes(searchTerm)
        );
      }

      setVisualizations(visualizations);
    } catch (err) {
      console.error('Failed to load visualizations:', err);
      setError('Failed to load visualizations');
    } finally {
      setLoading(false);
    }
  };

  // Load visualization types
  const loadTypes = async () => {
    try {
      const response = await visualizationService.getVisualizationTypes({ training_uuid });
      setTypes(response.data.types || []);
    } catch (err) {
      console.error('Failed to load visualization types:', err);
    }
  };

  useEffect(() => {
    loadVisualizations();
    loadTypes();
  }, [training_uuid, selectedType, selectedEpochFilter, selectedImageName]);

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile || !selectedEpoch || !uploadType) {
      setError('Please select an epoch, type, and file');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      await visualizationService.uploadVisualization(
        selectedEpoch,
        selectedFile,
        uploadType
      );

      setUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedEpoch('');
      setUploadType('segment');
      loadVisualizations();
      loadTypes();
    } catch (err) {
      console.error('Failed to upload visualization:', err);
      setError('Failed to upload visualization');
    } finally {
      setUploading(false);
    }
  };

  // Handle delete
  const handleDelete = async (visualization_uuid: string) => {
    if (!confirm('Are you sure you want to delete this visualization?')) {
      return;
    }

    try {
      await visualizationService.deleteVisualization(visualization_uuid);
      loadVisualizations();
      loadTypes();
    } catch (err) {
      console.error('Failed to delete visualization:', err);
      setError('Failed to delete visualization');
    }
  };

  // Handle compare selection
  const handleCompareToggle = (viz: Visualization) => {
    setSelectedForCompare(prev => {
      const exists = prev.find(v => v.visualization_uuid === viz.visualization_uuid);
      if (exists) {
        return prev.filter(v => v.visualization_uuid !== viz.visualization_uuid);
      } else if (prev.length < 4) {
        return [...prev, viz];
      } else {
        return prev;
      }
    });
  };

  // Handle image click
  const handleImageClick = (viz: Visualization) => {
    setSelectedImage(viz);
    setImageDialogOpen(true);
  };

  // Group visualizations by type and epoch
  const groupedVisualizations = visualizations.reduce((acc, viz) => {
    const key = `${viz.type}-${viz.epoch}`;
    if (!acc[key]) {
      acc[key] = { type: viz.type, epoch: viz.epoch, items: [] };
    }
    acc[key].items.push(viz);
    return acc;
  }, {} as Record<string, { type: string; epoch?: number; items: Visualization[] }>);

  return (
    <Box>
      {/* Header Actions */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Filter by Type</InputLabel>
              <Select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                label="Filter by Type"
              >
                <MenuItem value="all">All Types</MenuItem>
                {types.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Filter by Epoch</InputLabel>
              <Select
                value={selectedEpochFilter}
                onChange={(e) => setSelectedEpochFilter(e.target.value)}
                label="Filter by Epoch"
              >
                <MenuItem value="all">All Epochs</MenuItem>
                {epochs.map(epoch => (
                  <MenuItem key={epoch.epoch_uuid} value={epoch.epoch.toString()}>
                    Epoch {epoch.epoch}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Filter by Image Name"
              value={selectedImageName}
              onChange={(e) => setSelectedImageName(e.target.value)}
              placeholder="Enter image name..."
              sx={{ minWidth: 200 }}
            />
            
            {selectedForCompare.length > 0 && (
              <Chip
                label={`${selectedForCompare.length} selected for compare`}
                onDelete={() => setSelectedForCompare([])}
                color="primary"
              />
            )}
          </Box>

          <Box display="flex" gap={1}>
            {selectedForCompare.length >= 2 && (
              <Button
                variant="contained"
                startIcon={<CompareIcon />}
                onClick={() => setCompareDialogOpen(true)}
              >
                Compare ({selectedForCompare.length})
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload Visualization
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {/* Visualizations Grid */}
      {!loading && visualizations.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No visualizations found. Upload your first visualization to get started.
          </Typography>
        </Paper>
      )}

      {!loading && Object.values(groupedVisualizations).map((group, groupIdx) => (
        <Paper key={groupIdx} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {group.type} {group.epoch !== undefined && `- Epoch ${group.epoch}`}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={2}>
            {group.items.map(viz => (
              <Box key={viz.visualization_uuid} sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)', lg: 'calc(25% - 12px)' } }}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    border: selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)
                      ? '2px solid'
                      : 'none',
                    borderColor: 'primary.main'
                  }}
                >
                  <CardMedia
                    component="img"
                    height="200"
                    image={viz.signedUrl || ''}
                    alt={viz.filename}
                    onClick={() => handleImageClick(viz)}
                    sx={{ objectFit: 'contain', bgcolor: 'grey.100' }}
                  />
                  <CardContent>
                    <Typography variant="body2" noWrap title={viz.filename}>
                      {viz.filename}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {viz.type} • Epoch {viz.epoch}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      onClick={() => handleCompareToggle(viz)}
                      disabled={selectedForCompare.length >= 4 && !selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)}
                    >
                      {selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid) ? 'Unselect' : 'Compare'}
                    </Button>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(viz.visualization_uuid)}
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </CardActions>
                </Card>
              </Box>
            ))}
          </Box>
        </Paper>
      ))}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Visualization</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={2}>
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
              label="Type"
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              placeholder="e.g., segment, overlay, correct_only, compare"
              helperText="Enter a visualization type (e.g., segment, overlay, correct_only, compare)"
            />

            <Button
              variant="outlined"
              component="label"
              fullWidth
            >
              {selectedFile ? selectedFile.name : 'Select Image File'}
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={handleFileSelect}
              />
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!selectedFile || !selectedEpoch || !uploadType || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog open={compareDialogOpen} onClose={() => setCompareDialogOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle>
          Compare Visualizations
          <IconButton
            onClick={() => setCompareDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexWrap="wrap" gap={2}>
            {selectedForCompare.map(viz => (
              <Box key={viz.visualization_uuid} sx={{ width: { xs: '100%', md: selectedForCompare.length === 2 ? 'calc(50% - 8px)' : 'calc(50% - 8px)', lg: selectedForCompare.length === 2 ? 'calc(50% - 8px)' : 'calc(25% - 12px)' } }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {viz.type} - Epoch {viz.epoch}
                  </Typography>
                  <Box
                    component="img"
                    src={viz.signedUrl || ''}
                    alt={viz.filename}
                    sx={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: 500,
                      objectFit: 'contain',
                      bgcolor: 'grey.100'
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    {viz.filename}
                  </Typography>
                </Paper>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompareDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Image View Dialog */}
      <Dialog open={imageDialogOpen} onClose={() => setImageDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {selectedImage?.filename}
          <IconButton
            onClick={() => setImageDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedImage && (
            <Box>
              <Box
                component="img"
                src={selectedImage.signedUrl || ''}
                alt={selectedImage.filename}
                sx={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  bgcolor: 'grey.100'
                }}
              />
              <Box mt={2}>
                <Typography variant="body2">
                  <strong>Type:</strong> {selectedImage.type}
                </Typography>
                <Typography variant="body2">
                  <strong>Epoch:</strong> {selectedImage.epoch}
                </Typography>
                <Typography variant="body2">
                  <strong>Uploaded:</strong> {new Date(selectedImage.uploadedAt).toLocaleString()}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TrainingVisualizationsTab;
