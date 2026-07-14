import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  IconButton,
  Chip,
  Collapse,
  Dialog,
  DialogContent
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { visualizationService } from '../services/visualizationService';
import { trainingService } from '../services/trainingService';
import { Visualization, Training, VisualizationsPaginatedResponse } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

interface TrainingWithVisualizations {
  training: Training;
  visualizations: Visualization[];
  visualizationsByType: Map<string, Visualization[]>;
}

// The endpoint may enrich each visualization with its parent training's uuid,
// either flattened onto the record or nested under a `training` object.
interface VisualizationWithTrainingRef extends Visualization {
  training?: { uuid: string };
}

export const VisualizationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [expandedTrainings, setExpandedTrainings] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedTrainings, setSelectedTrainings] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Visualization | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [actionError, setError] = useState<string | null>(null);

  usePageTitle('Visualizations - Vision');

  const {
    data: trainings = [],
    isLoading: loading,
    error: queryError
  } = useQuery({
    queryKey: ['visualizations-overview'],
    queryFn: async (): Promise<TrainingWithVisualizations[]> => {
      // Make two parallel requests instead of N+1 requests
      const [trainingsResponse, visualizationsResponse] = await Promise.all([
        trainingService.getTrainings({
          page: 1,
          limit: 1000
        }),
        visualizationService.getVisualizationsByTraining(
          '', // Empty to get all visualizations
          {
            limit: 10000
          }
        )
      ]);

      const allTrainings = trainingsResponse.data.trainings || [];
      const allVisualizations = (visualizationsResponse as VisualizationsPaginatedResponse).data.visualizations || [];

      // Group visualizations by training_uuid (from epoch data)
      const visualizationsByTraining = new Map<string, Visualization[]>();

      // We need to get epoch data to link visualizations to trainings
      // For now, let's group by the training info if available in the visualization
      // If not, we'll need to fetch epoch data
      allVisualizations.forEach((viz: VisualizationWithTrainingRef) => {
        // Try to find training from epoch_uuid
        // Since we have the epoch data in the visualization response, we can use it
        // Note: This requires backend to include training_uuid in the response
        const trainingUuid = viz.training_uuid || viz.training?.uuid;
        if (trainingUuid) {
          const existing = visualizationsByTraining.get(trainingUuid) || [];
          existing.push(viz);
          visualizationsByTraining.set(trainingUuid, existing);
        }
      });

      // Build trainings with visualizations
      const trainingsWithViz: TrainingWithVisualizations[] = [];

      for (const training of allTrainings) {
        const trainingUuid = training.uuid || training.training_uuid || '';
        const visualizations = visualizationsByTraining.get(trainingUuid) || [];

        if (visualizations.length > 0) {
          // Group visualizations by type
          const visualizationsByType = new Map<string, Visualization[]>();
          visualizations.forEach(viz => {
            const existing = visualizationsByType.get(viz.type) || [];
            existing.push(viz);
            visualizationsByType.set(viz.type, existing);
          });

          trainingsWithViz.push({
            training,
            visualizations,
            visualizationsByType
          });
        }
      }

      return trainingsWithViz;
    }
  });

  const error =
    actionError ||
    (queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load trainings and visualizations') : null);

  const toggleTraining = (trainingId: string) => {
    const newExpanded = new Set(expandedTrainings);
    if (newExpanded.has(trainingId)) {
      newExpanded.delete(trainingId);
    } else {
      newExpanded.add(trainingId);
    }
    setExpandedTrainings(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleToggleTrainingSelection = (trainingId: string) => {
    const newSelected = new Set(selectedTrainings);
    if (newSelected.has(trainingId)) {
      newSelected.delete(trainingId);
    } else {
      newSelected.add(trainingId);
    }
    setSelectedTrainings(newSelected);
  };

  const handleCompareToggle = () => {
    if (compareMode) {
      setSelectedTrainings(new Set());
    }
    setCompareMode(!compareMode);
  };

  const handleViewComparison = () => {
    if (selectedTrainings.size < 2) {
      setError('Please select at least 2 trainings to compare');
      return;
    }
    const ids = Array.from(selectedTrainings);
    navigate(`/visualizations/compare-trainings?ids=${ids.join(',')}`);
  };

  const handleImageClick = (image: Visualization) => {
    setSelectedImage(image);
    setImageModalOpen(true);
  };

  const handleCloseImageModal = () => {
    setImageModalOpen(false);
    setSelectedImage(null);
  };

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        Training Visualizations Comparison
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {/* Filter Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              {compareMode 
                ? 'Select trainings to compare visualizations' 
                : 'Expand trainings to view and compare visualizations'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {compareMode && selectedTrainings.size > 0 && (
                <>
                  <Typography variant="body2" color="primary" sx={{
                    fontWeight: 600
                  }}>
                    {selectedTrainings.size} selected
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={handleViewComparison}
                    size="small"
                    disabled={selectedTrainings.size < 2}
                  >
                    View Comparison
                  </Button>
                </>
              )}
              <Button
                variant={compareMode ? 'outlined' : 'outlined'}
                onClick={handleCompareToggle}
                size="small"
              >
                {compareMode ? 'Cancel' : 'Compare Trainings'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : trainings.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary" align="center" sx={{ pb: 4 }}>
              No trainings with visualizations found
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {trainings.map((trainingWithViz) => {
            const isExpanded = expandedTrainings.has(trainingWithViz.training._id);
            const isSelected = selectedTrainings.has(trainingWithViz.training._id);
            const availableTypes = Array.from(trainingWithViz.visualizationsByType.keys());

            return (
              <Card 
                key={trainingWithViz.training._id}
                sx={{
                  border: isSelected ? '2px solid' : '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'divider'
                }}
              >
                <CardContent>
                  {/* Training Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1,
                      borderRadius: 1,
                      mb: isExpanded ? 2 : 0
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {compareMode && (
                        <Chip
                          label={isSelected ? '✓' : '○'}
                          size="small"
                          color={isSelected ? 'primary' : 'default'}
                          onClick={() => handleToggleTrainingSelection(trainingWithViz.training._id)}
                          sx={{ cursor: 'pointer', minWidth: '32px' }}
                        />
                      )}
                      <IconButton 
                        size="small" 
                        onClick={() => !compareMode && toggleTraining(trainingWithViz.training._id)}
                        disabled={compareMode}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                      <Box 
                        sx={{ cursor: compareMode ? 'pointer' : 'default' }}
                        onClick={() => compareMode && handleToggleTrainingSelection(trainingWithViz.training._id)}
                      >
                        <Typography variant="h6">
                          {trainingWithViz.training.name}
                        </Typography>
                        <Typography variant="body2" sx={{
                          color: "text.secondary"
                        }}>
                          {trainingWithViz.visualizations.length} visualizations across {availableTypes.length} types
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {availableTypes.map(type => (
                        <Chip key={type} label={type} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </Box>

                  {/* Expanded Visualizations */}
                  <Collapse in={isExpanded}>
                    <Box>
                      {/* Type Selector */}
                      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {availableTypes.map(type => (
                          <Button
                            key={type}
                            size="small"
                            variant={selectedType === type ? 'contained' : 'outlined'}
                            onClick={() => setSelectedType(selectedType === type ? null : type)}
                          >
                            {type}
                          </Button>
                        ))}
                      </Box>

                      {/* Visualization Grid - Side by Side */}
                      {selectedType && trainingWithViz.visualizationsByType.get(selectedType) && (
                        <Box>
                          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                            {selectedType} - Comparison View
                          </Typography>
                          <Box
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                              gap: 2
                            }}
                          >
                            {trainingWithViz.visualizationsByType.get(selectedType)!
                              .sort((a, b) => (a.epoch || 0) - (b.epoch || 0))
                              .map((viz) => (
                                <Card key={viz.visualization_uuid} variant="outlined">
                                  <CardContent>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                      Epoch {viz.epoch}
                                    </Typography>
                                    <Box
                                      component="img"
                                      src={viz.signedUrl || ''}
                                      alt={viz.filename}
                                      sx={{
                                        width: '100%',
                                        height: 'auto',
                                        maxHeight: '400px',
                                        objectFit: 'contain',
                                        bgcolor: 'background.default',
                                        borderRadius: 1,
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => handleImageClick(viz)}
                                    />
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        display: "block",
                                        color: "text.secondary",
                                        mt: 1
                                      }}>
                                      {viz.filename}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        display: "block",
                                        color: "text.secondary"
                                      }}>
                                      {formatDate(viz.uploadedAt)}
                                    </Typography>
                                  </CardContent>
                                </Card>
                              ))}
                          </Box>
                        </Box>
                      )}

                      {/* Show all types overview when none selected */}
                      {!selectedType && (
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{
                              color: "text.secondary",
                              mb: 2
                            }}>
                            Select a visualization type above to view side-by-side comparison
                          </Typography>
                          <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell><strong>Type</strong></TableCell>
                                  <TableCell><strong>Count</strong></TableCell>
                                  <TableCell><strong>Epochs</strong></TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {availableTypes.map(type => {
                                  const vizOfType = trainingWithViz.visualizationsByType.get(type)!;
                                  const epochs = [...new Set(vizOfType.map(v => v.epoch))].sort((a, b) => (a || 0) - (b || 0));
                                  return (
                                    <TableRow key={type} hover>
                                      <TableCell>
                                        <Chip label={type} size="small" color="primary" variant="outlined" />
                                      </TableCell>
                                      <TableCell>{vizOfType.length}</TableCell>
                                      <TableCell>
                                        {epochs.map(e => `Epoch ${e}`).join(', ')}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
      {/* Image Modal */}
      <Dialog
        open={imageModalOpen}
        onClose={handleCloseImageModal}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent sx={{ p: 0, position: 'relative', height: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconButton
            onClick={handleCloseImageModal}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              bgcolor: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.7)',
              },
              zIndex: 1,
            }}
          >
            <CloseIcon />
          </IconButton>
          {selectedImage && (
            <Box
              component="img"
              src={selectedImage.signedUrl}
              alt={selectedImage.filename}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default VisualizationsPage;
