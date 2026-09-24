import React, { useEffect, useState } from 'react';
import { PageHeader, onImage } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
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
import { Visualization, VisualizationSummary, VisualizationsPaginatedResponse } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatDateTime } from '../utils';

/** Most images of one type loaded per training. */
const GALLERY_LIMIT = 200;

export const TrainingVisualizationsComparisonPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<Visualization | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  usePageTitle('Compare Training Visualizations - Vision');

  const idsParam = searchParams.get('ids');

  const trainingIds = React.useMemo(() => (idsParam ? idsParam.split(',').filter(Boolean) : []), [idsParam]);

  // Which trainings, and what they have: counts and types only, no images.
  const {
    data: trainings = [],
    isLoading: loading,
    error: queryError
  } = useQuery({
    queryKey: ['visualizations-summary', 'compare', idsParam],
    queryFn: async (): Promise<VisualizationSummary[]> => {
      if (!idsParam) {
        throw new Error('No training IDs provided in URL');
      }
      if (trainingIds.length < 2) {
        throw new Error('At least 2 training IDs are required for comparison');
      }
      const rows = new Map((await visualizationService.getVisualizationSummary()).map((row) => [row._id, row]));
      const selected = trainingIds.map((id) => rows.get(id)).filter((row): row is VisualizationSummary => Boolean(row));
      if (selected.length === 0) {
        throw new Error('No trainings found with the provided IDs');
      }
      return selected;
    }
  });

  const availableTypes = React.useMemo(
    () => [...new Set(trainings.flatMap((row) => row.types.map(({ type }) => type)))].sort(),
    [trainings]
  );

  // The selected type's images, per training, fetched side by side.
  const { data: galleries = {} } = useQuery({
    queryKey: ['visualizations', 'compare', idsParam, selectedType],
    queryFn: async (): Promise<Record<string, Visualization[]>> => {
      const pages = await Promise.all(
        trainings.map(async (row) => {
          if (!row.types.some(({ type }) => type === selectedType)) return [row._id, []] as const;
          const response = await visualizationService.getVisualizationsByTraining(row.uuid, {
            type: selectedType!,
            limit: GALLERY_LIMIT,
            includeUrls: true
          }) as VisualizationsPaginatedResponse;
          return [row._id, response.data.visualizations] as const;
        })
      );
      return Object.fromEntries(pages);
    },
    enabled: trainings.length > 0 && !!selectedType
  });

  const error = queryError instanceof Error ? queryError.message : (queryError ? 'Failed to load comparison data' : null);

  // Auto-select first type once data loads
  useEffect(() => {
    if (availableTypes.length > 0 && !selectedType) {
      setSelectedType(availableTypes[0]);
    }
  }, [availableTypes, selectedType]);

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
      <PageHeader
        title="Training Visualizations Comparison"
        actions={
          <Button variant="outlined" onClick={copyShareUrl} size="small">
            Copy Share Link
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
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
                  <Card key={t._id} variant="outlined" sx={{ flex: '1 1 200px' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Link 
                        to={`/trainings/${t._id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <Typography variant="subtitle2" sx={{
                          fontWeight: 600
                        }}>
                          {t.name}
                        </Typography>
                      </Link>
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        {t.total} visualizations
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
                    const vizForType = galleries[trainingData._id] || [];
                    return (
                      <Box key={trainingData._id}>
                        <Link 
                          to={`/trainings/${trainingData._id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center', position: 'sticky', top: 0, bgcolor: 'background.paper', py: 1, zIndex: 1 }}>
                            {trainingData.name}
                          </Typography>
                        </Link>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {vizForType.length > 0 ? (
                            vizForType
                              .sort((a, b) => (a.epoch || 0) - (b.epoch || 0))
                              .map((viz) => (
                                <Card key={viz.visualization_uuid} variant="outlined">
                                  <CardContent sx={{ p: 1.5 }}>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        display: "block",
                                        mb: 1,
                                        fontWeight: 600
                                      }}>
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
                                        mt: 0.5
                                      }}>
                                      {formatDateTime(viz.uploadedAt)}
                                    </Typography>
                                  </CardContent>
                                </Card>
                              ))
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{
                                color: "text.secondary",
                                textAlign: 'center',
                                py: 2
                              }}>
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
              bgcolor: onImage.scrim,
              color: onImage.ink,
              '&:hover': {
                bgcolor: onImage.scrimStrong,
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
