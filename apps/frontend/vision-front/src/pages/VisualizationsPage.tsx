import React, { useState } from 'react';
import { PageHeader } from '@visin/frontend-core';
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
import { Visualization, VisualizationsPaginatedResponse } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

/** Most images one training shows for one type at a time. */
const GALLERY_LIMIT = 200;

const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

/**
 * One training's images of one type, side by side by epoch. Loaded only when
 * shown: the overview carries counts, never images or their signed URLs.
 */
function TypeGallery({ trainingUuid, type, onImageClick }: {
  trainingUuid: string;
  type: string;
  onImageClick: (viz: Visualization) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['visualizations', trainingUuid, type],
    queryFn: async () =>
      (await visualizationService.getVisualizationsByTraining(trainingUuid, {
        type,
        limit: GALLERY_LIMIT,
        includeUrls: true
      }) as VisualizationsPaginatedResponse).data
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (error || !data) {
    return <Alert severity="error">Failed to load {type} visualizations</Alert>;
  }

  const shown = [...data.visualizations].sort((a, b) => (a.epoch || 0) - (b.epoch || 0));
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
        {type} - Comparison View
      </Typography>
      {data.pagination.total > shown.length && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Showing the latest {shown.length} of {data.pagination.total}
        </Typography>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 2
        }}
      >
        {shown.map((viz) => (
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
                onClick={() => onImageClick(viz)}
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
  );
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
    queryKey: ['visualizations-summary'],
    queryFn: () => visualizationService.getVisualizationSummary()
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
      <PageHeader title="Training Visualizations Comparison" />
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
          {trainings.map((training) => {
            const isExpanded = expandedTrainings.has(training._id);
            const isSelected = selectedTrainings.has(training._id);
            const availableTypes = training.types.map(({ type }) => type);

            return (
              <Card 
                key={training._id}
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
                          onClick={() => handleToggleTrainingSelection(training._id)}
                          sx={{ cursor: 'pointer', minWidth: '32px' }}
                        />
                      )}
                      <IconButton 
                        size="small" 
                        onClick={() => !compareMode && toggleTraining(training._id)}
                        disabled={compareMode}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                      <Box 
                        sx={{ cursor: compareMode ? 'pointer' : 'default' }}
                        onClick={() => compareMode && handleToggleTrainingSelection(training._id)}
                      >
                        <Typography variant="h6">
                          {training.name}
                        </Typography>
                        <Typography variant="body2" sx={{
                          color: "text.secondary"
                        }}>
                          {training.total} visualizations across {availableTypes.length} types
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
                      {isExpanded && selectedType && availableTypes.includes(selectedType) && (
                        <TypeGallery trainingUuid={training.uuid} type={selectedType} onImageClick={handleImageClick} />
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
                                {training.types.map(({ type, count, epochs }) => {
                                  return (
                                    <TableRow key={type} hover>
                                      <TableCell>
                                        <Chip label={type} size="small" color="primary" variant="outlined" />
                                      </TableCell>
                                      <TableCell>{count}</TableCell>
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
