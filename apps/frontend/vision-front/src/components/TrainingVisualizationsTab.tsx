import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Stack,
  Paper
} from '@mui/material';
import {
  Upload as UploadIcon,
  CompareArrows as CompareIcon,
  Image as ImageIcon
} from '@mui/icons-material';
import { Epoch, Visualization } from '../types';
import { useTrainingVisualizations } from '../hooks/useTrainingVisualizations';
import VisualizationFilters from './visualizations/VisualizationFilters';
import VisualizationGrid from './visualizations/VisualizationGrid';
import UploadVisualizationDialog from './visualizations/UploadVisualizationDialog';
import CompareVisualizationsDialog from './visualizations/CompareVisualizationsDialog';
import ImageViewDialog from './visualizations/ImageViewDialog';

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
  const {
    visualizations,
    loading,
    error,
    setError,
    selectedType,
    setSelectedType,
    selectedEpochFilter,
    setSelectedEpochFilter,
    selectedImageName,
    setSelectedImageName,
    types,
    uploading,
    handleUpload,
    handleDelete
  } = useTrainingVisualizations({ training_uuid });

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Visualization[]>([]);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Visualization | null>(null);

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

  return (
    <Box>
      {/* Header Actions */}
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
      <VisualizationFilters
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        types={types}
        selectedEpochFilter={selectedEpochFilter}
        setSelectedEpochFilter={setSelectedEpochFilter}
        epochs={epochs}
        selectedImageName={selectedImageName}
        setSelectedImageName={setSelectedImageName}
        selectedForCompare={selectedForCompare}
        setSelectedForCompare={setSelectedForCompare}
      />
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {/* Loading State */}
      {loading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 8
          }}>
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
          <Typography variant="h6" gutterBottom sx={{
            color: "text.secondary"
          }}>
            No visualizations found
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 3
            }}>
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
      {!loading && visualizations.length > 0 && (
        <VisualizationGrid
          visualizations={visualizations}
          selectedForCompare={selectedForCompare}
          handleCompareToggle={handleCompareToggle}
          handleImageClick={handleImageClick}
          handleDelete={handleDelete}
          isAuthenticated={isAuthenticated}
        />
      )}
      {/* Upload Dialog */}
      <UploadVisualizationDialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        epochs={epochs}
        onUpload={handleUpload}
        uploading={uploading}
      />
      {/* Compare Dialog */}
      <CompareVisualizationsDialog
        open={compareDialogOpen}
        onClose={() => setCompareDialogOpen(false)}
        selectedForCompare={selectedForCompare}
      />
      {/* Image View Dialog */}
      <ImageViewDialog
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        selectedImage={selectedImage}
      />
    </Box>
  );
};

export default TrainingVisualizationsTab;
