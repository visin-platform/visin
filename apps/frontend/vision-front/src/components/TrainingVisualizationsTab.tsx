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
  TextField,
  Stack,
  Grid,
  useTheme,
  alpha,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Upload as UploadIcon,
  Delete as DeleteIcon,
  CompareArrows as CompareIcon,
  Close as CloseIcon,
  FilterList as FilterListIcon,
  Image as ImageIcon,
  ZoomIn as ZoomInIcon,
  CloudUpload as CloudUploadIcon
} from '@mui/icons-material';
import { visualizationService } from '../services/visualizationService';
import { Visualization, Epoch, PaginatedResponse } from '../types';

interface TrainingVisualizationsTabProps {
  training_uuid: string;
  epochs: Epoch[];
  isAuthenticated: boolean;
}

const TrainingVisualizationsTab: React.FC<TrainingVisualizationsTabProps> = ({
  training_uuid,
  epochs,
  isAuthenticated
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
  const theme = useTheme();

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
      ) as PaginatedResponse<Visualization>;

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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6" fontWeight="bold">
          Visualizations
        </Typography>
        <Stack direction="row" spacing={2}>
          {selectedForCompare.length >= 2 && (
            <Button
              variant="outlined"
              startIcon={<CompareIcon />}
              onClick={() => setCompareDialogOpen(true)}
            >
              Compare ({selectedForCompare.length})
            </Button>
          )}
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload New
            </Button>
          )}
        </Stack>
      </Box>

      {/* Filters */}
      <Paper 
        elevation={0} 
        variant="outlined" 
        sx={{ 
          p: 2, 
          mb: 3, 
          borderRadius: 2,
          bgcolor: 'background.paper'
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <Box display="flex" alignItems="center" color="text.secondary">
            <FilterListIcon sx={{ mr: 1 }} />
            <Typography variant="subtitle2" fontWeight={600}>Filters:</Typography>
          </Box>
          
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              label="Type"
            >
              <MenuItem value="all">All Types</MenuItem>
              {types.map(type => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Epoch</InputLabel>
            <Select
              value={selectedEpochFilter}
              onChange={(e) => setSelectedEpochFilter(e.target.value)}
              label="Epoch"
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
            label="Search by Name"
            value={selectedImageName}
            onChange={(e) => setSelectedImageName(e.target.value)}
            placeholder="e.g. image_001"
            sx={{ flexGrow: 1 }}
          />
          
          {selectedForCompare.length > 0 && (
            <Chip
              label={`${selectedForCompare.length} selected`}
              onDelete={() => setSelectedForCompare([])}
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      )}

      {/* Visualizations Grid */}
      {!loading && visualizations.length === 0 && (
        <Paper 
          elevation={0} 
          variant="outlined" 
          sx={{ 
            p: 6, 
            textAlign: 'center', 
            borderRadius: 2,
            bgcolor: 'background.paper'
          }}
        >
          <ImageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No visualizations found
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Try adjusting your filters or upload a new visualization.
          </Typography>
          {isAuthenticated && (
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload Visualization
            </Button>
          )}
        </Paper>
      )}

      {!loading && Object.values(groupedVisualizations).map((group, groupIdx) => (
        <Box key={groupIdx} mb={4}>
          <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600} sx={{ mr: 2 }}>
              {group.type}
            </Typography>
            {group.epoch !== undefined && (
              <Chip label={`Epoch ${group.epoch}`} size="small" color="primary" variant="outlined" />
            )}
          </Box>
          
          <Grid container spacing={2}>
            {group.items.map(viz => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={viz.visualization_uuid}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    transition: 'all 0.2s',
                    borderColor: selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)
                      ? 'primary.main'
                      : 'divider',
                    borderWidth: selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)
                      ? 2
                      : 1,
                    '&:hover': {
                      borderColor: 'primary.main',
                      transform: 'translateY(-2px)',
                      boxShadow: theme.shadows[2]
                    }
                  }}
                >
                  <Box sx={{ position: 'relative', pt: '75%', bgcolor: 'grey.100', overflow: 'hidden' }}>
                    <CardMedia
                      component="img"
                      image={viz.signedUrl || ''}
                      alt={viz.filename}
                      onClick={() => handleImageClick(viz)}
                      sx={{ 
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        cursor: 'pointer',
                        p: 1
                      }}
                    />
                    <Box 
                      className="hover-actions"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        bgcolor: 'rgba(255,255,255,0.8)',
                        borderRadius: 1,
                        '.MuiCard-root:hover &': { opacity: 1 }
                      }}
                    >
                      <Tooltip title="View Full Size">
                        <IconButton size="small" onClick={() => handleImageClick(viz)}>
                          <ZoomInIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                  
                  <CardContent sx={{ p: 1.5, flexGrow: 1 }}>
                    <Typography variant="body2" noWrap title={viz.filename} fontWeight={500}>
                      {viz.filename}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {new Date(viz.uploadedAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                  
                  <Divider />
                  
                  <CardActions sx={{ p: 1, justifyContent: 'space-between' }}>
                    <Button
                      size="small"
                      startIcon={<CompareIcon />}
                      onClick={() => handleCompareToggle(viz)}
                      disabled={selectedForCompare.length >= 4 && !selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid)}
                      color={selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid) ? "primary" : "inherit"}
                    >
                      {selectedForCompare.find(v => v.visualization_uuid === viz.visualization_uuid) ? 'Selected' : 'Compare'}
                    </Button>
                    {isAuthenticated && (
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(viz.visualization_uuid)}
                          sx={{ 
                            color: 'text.secondary',
                            '&:hover': { color: 'error.main' }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}

      {/* Upload Dialog */}
      <Dialog 
        open={uploadDialogOpen} 
        onClose={() => setUploadDialogOpen(false)} 
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
          <Button onClick={() => setUploadDialogOpen(false)} color="inherit">Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={!selectedFile || !selectedEpoch || !uploadType || uploading}
            startIcon={<UploadIcon />}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog 
        open={compareDialogOpen} 
        onClose={() => setCompareDialogOpen(false)} 
        maxWidth="xl" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, height: '90vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Compare Visualizations</Typography>
          <IconButton onClick={() => setCompareDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ height: '100%' }}>
            {selectedForCompare.map(viz => (
              <Grid size={{ xs: 12, md: selectedForCompare.length === 2 ? 6 : 6, lg: selectedForCompare.length === 2 ? 6 : 3 }} key={viz.visualization_uuid}>
                <Paper 
                  variant="outlined" 
                  sx={{ 
                    p: 2, 
                    height: '100%', 
                    display: 'flex', 
                    flexDirection: 'column',
                    bgcolor: 'background.default'
                  }}
                >
                  <Box mb={2}>
                    <Chip 
                      label={viz.type} 
                      size="small" 
                      color="primary" 
                      sx={{ mr: 1, textTransform: 'uppercase', fontWeight: 600, fontSize: '0.7rem' }} 
                    />
                    <Chip 
                      label={`Epoch ${viz.epoch}`} 
                      size="small" 
                      variant="outlined" 
                      sx={{ fontWeight: 600, fontSize: '0.7rem' }} 
                    />
                  </Box>
                  
                  <Box 
                    sx={{ 
                      flexGrow: 1, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      bgcolor: 'grey.100',
                      borderRadius: 1,
                      overflow: 'hidden',
                      mb: 2
                    }}
                  >
                    <Box
                      component="img"
                      src={viz.signedUrl || ''}
                      alt={viz.filename}
                      sx={{
                        maxWidth: '100%',
                        maxHeight: '60vh',
                        objectFit: 'contain'
                      }}
                    />
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary" align="center" display="block" fontFamily="monospace">
                    {viz.filename}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setCompareDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Image View Dialog */}
      <Dialog 
        open={imageDialogOpen} 
        onClose={() => setImageDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, bgcolor: 'black' } }}
      >
        <DialogTitle sx={{ color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1">{selectedImage?.filename}</Typography>
          <IconButton onClick={() => setImageDialogOpen(false)} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
          {selectedImage && (
            <Box
              component="img"
              src={selectedImage.signedUrl || ''}
              alt={selectedImage.filename}
              sx={{
                maxWidth: '100%',
                maxHeight: '85vh',
                objectFit: 'contain'
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'black', p: 2 }}>
          {selectedImage && (
            <Box display="flex" gap={2} mr="auto">
              <Chip label={selectedImage.type} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
              <Chip label={`Epoch ${selectedImage.epoch}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            </Box>
          )}
          <Button onClick={() => setImageDialogOpen(false)} sx={{ color: 'white' }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TrainingVisualizationsTab;
