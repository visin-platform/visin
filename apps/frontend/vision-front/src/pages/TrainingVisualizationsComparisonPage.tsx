import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Typography,
  Container,
  Dialog,
  DialogContent,
  IconButton
} from '@mui/material';
import {
  Close as CloseIcon
} from '@mui/icons-material';
import { visualizationService } from '../services/visualizationService';
import { trainingService } from '../services/trainingService';
import { Visualization, Training } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatDateTime } from '../utils';

interface TrainingWithVisualizations {
  training: Training;
  visualizations: Visualization[];
  visualizationsByType: Map<string, Visualization[]>;
}

export const TrainingVisualizationsComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainings, setTrainings] = useState<TrainingWithVisualizations[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<Visualization | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  usePageTitle('Compare Training Visualizations - Vision');

  useEffect(() => {
    loadTrainingsFromUrl();
  }, [searchParams]);

  const loadTrainingsFromUrl = async () => {
    const idsParam = searchParams.get('ids');
    if (!idsParam) {
      setError('No training IDs provided in URL');
      return;
    }

    const trainingIds = idsParam.split(',');
    if (trainingIds.length < 2) {
      setError('At least 2 training IDs are required for comparison');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First, fetch the selected trainings to get projectId
      const allTrainingsResponse = await trainingService.getTrainings({
        page: 1,
        limit: 1000
      });
      const allTrainings = allTrainingsResponse.data.trainings || [];
      const selectedTrainings = allTrainings.filter((t: Training) => 
        trainingIds.includes(t.uuid)
      );

      if (selectedTrainings.length === 0) {
        setError('No trainings found with the provided IDs');
        return;
      }

      // Get projectId from first training (assuming all are from same project)
      const projectId = selectedTrainings[0].projectId;

      // Fetch grouped visualizations for the project
      const visualizationsResponse = await visualizationService.getVisualizationsByTraining('', {
        projectId,
        includeUrls: true // Need URLs for display
      }) as { data: { trainings: any[] } };

      const groupedTrainings = visualizationsResponse.data.trainings || [];

      // Filter to only selected trainings
      const selectedGroupedTrainings = groupedTrainings.filter((gt: any) => 
        trainingIds.includes(gt.training_uuid)
      );

      // Build trainingsWithViz from grouped data
      const trainingsWithViz: TrainingWithVisualizations[] = [];
      const allTypesSet = new Set<string>();

      for (const groupedTraining of selectedGroupedTrainings) {
        const training = selectedTrainings.find((t: Training) => t.uuid === groupedTraining.training_uuid);
        if (!training) continue;

        // Group visualizations by type
        const visualizationsByType = new Map<string, Visualization[]>();
        groupedTraining.visualizations.forEach((viz: Visualization) => {
          const existing = visualizationsByType.get(viz.type) || [];
          existing.push(viz);
          visualizationsByType.set(viz.type, existing);
          allTypesSet.add(viz.type);
        });

        trainingsWithViz.push({
          training,
          visualizations: groupedTraining.visualizations,
          visualizationsByType
        });
      }

      setTrainings(trainingsWithViz);
      setAvailableTypes(Array.from(allTypesSet));
      
      // Auto-select first type if available
      if (allTypesSet.size > 0 && !selectedType) {
        setSelectedType(Array.from(allTypesSet)[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };

  const copyShareUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  };

  const handleImageClick = (image: Visualization) => {
    setSelectedImage(image);
    setImageModalOpen(true);
  };

  const handleCloseImageModal = () => {
    setImageModalOpen(false);
    setSelectedImage(null);
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">
          Training Visualizations Comparison
        </Typography>
        <Button variant="outlined" onClick={copyShareUrl} size="small">
          Copy Share Link
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {trainings.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="textSecondary" align="center" sx={{ pb: 4 }}>
              No visualizations found for the selected trainings
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Training Info */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Comparing {trainings.length} Trainings
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {trainings.map((t) => (
                  <Card key={t.training._id} variant="outlined" sx={{ flex: '1 1 200px' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Link 
                        to={`/trainings/${t.training._id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <Typography variant="subtitle2" fontWeight={600}>
                          {t.training.name}
                        </Typography>
                      </Link>
                      <Typography variant="caption" color="text.secondary">
                        {t.visualizations.length} visualizations
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Type selector */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Select Visualization Type
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {availableTypes.map(type => (
                  <Button
                    key={type}
                    size="small"
                    variant={selectedType === type ? 'contained' : 'outlined'}
                    onClick={() => setSelectedType(type)}
                  >
                    {type}
                  </Button>
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Comparison Grid */}
          {selectedType && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 3 }}>
                  {selectedType} Comparison
                </Typography>
                
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: `repeat(${trainings.length}, 1fr)`, 
                  gap: 2,
                  overflowX: 'auto'
                }}>
                  {trainings.map((trainingData) => {
                    const vizForType = trainingData.visualizationsByType.get(selectedType) || [];
                    return (
                      <Box key={trainingData.training._id}>
                        <Link 
                          to={`/trainings/${trainingData.training._id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center', position: 'sticky', top: 0, bgcolor: 'background.paper', py: 1, zIndex: 1 }}>
                            {trainingData.training.name}
                          </Typography>
                        </Link>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {vizForType.length > 0 ? (
                            vizForType
                              .sort((a, b) => (a.epoch || 0) - (b.epoch || 0))
                              .map((viz) => (
                                <Card key={viz.visualization_uuid} variant="outlined">
                                  <CardContent sx={{ p: 1.5 }}>
                                    <Typography variant="caption" display="block" sx={{ mb: 1, fontWeight: 600 }}>
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
                                        bgcolor: 'grey.100',
                                        borderRadius: 1,
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => handleImageClick(viz)}
                                    />
                                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }} color="text.secondary">
                                      {formatDateTime(viz.uploadedAt)}
                                    </Typography>
                                  </CardContent>
                                </Card>
                              ))
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                              No {selectedType} visualizations
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          )}
        </>
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

export default TrainingVisualizationsComparisonPage;
