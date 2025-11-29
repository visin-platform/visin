import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Card,
  CardMedia,
  CardContent,
  CircularProgress,
  Alert,
  Paper,
  LinearProgress,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  PlayArrow as PlayArrowIcon,
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DatasetImage,
  getAllImages,
  updateDatasetImage,
  getLabelingStats,
  WeatherCondition
} from '../services/datasetImageService';
import { usePageTitle } from '../hooks/usePageTitle';
import { useParams, useNavigate } from 'react-router-dom';

const ImageLabelingPage: React.FC = () => {
  const { imageId } = useParams<{ imageId?: string }>();
  const navigate = useNavigate();
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [labeling, setLabeling] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [setupMode, setSetupMode] = useState(true);
  const [imageLimit, setImageLimit] = useState(100);

  // Weather condition options
  const WEATHER_CONDITIONS: { value: WeatherCondition; label: string }[] = [
    { value: 'day_fair', label: 'Day Fair' },
    { value: 'night_fair', label: 'Night Fair' },
    { value: 'day_rain', label: 'Day Rain' },
    { value: 'night_rain', label: 'Night Rain' },
    { value: 'snow', label: 'Snow' }
  ];

  // Weather filtering state
  const [selectedWeatherFilter, setSelectedWeatherFilter] = useState<WeatherCondition | ''>('');

  // Session labeling state - tracks decisions for each image in current session
  const [sessionLabels, setSessionLabels] = useState<Record<string, 'good' | 'bad' | 'skip'>>({});

  const queryClient = useQueryClient();

  // Set page title
  usePageTitle('Image Labeling - Vision');

  // Get overall labeling metrics
  const { data: labelingMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['overallLabelingMetrics'],
    queryFn: async () => {
      // Use efficient aggregation endpoint instead of loading all images
      return await getLabelingStats();
    },
    retry: false,
  });

  const startLabeling = async () => {
    if (imageLimit < 1) {
      showAlert('error', 'Please enter a number greater than 0');
      return;
    }

    setLoading(true);
    setSetupMode(false);

    try {
      // Fetch images with backend filtering - single request
      console.log('Fetching images with backend filtering...');
      const response = await getAllImages(1, imageLimit, undefined, undefined, true, selectedWeatherFilter || undefined);
      console.log('getAllImages response:', response);

      if (response.success && response.data.images) {
        const allImages = response.data.images;
        console.log('Total images found:', allImages.length);

        // Filter for unlabeled images (images with no tags) - backend should have already done weather filtering
        const unlabeledImages = allImages.filter((image: DatasetImage) =>
          !image.tags || image.tags.length === 0
        );

        console.log('Unlabeled images found:', unlabeledImages.length);
        console.log('Weather filter applied:', selectedWeatherFilter || 'none');

        if (unlabeledImages.length > 0) {
          // Use the filtered images directly
          setImages(unlabeledImages);
          setCurrentImageIndex(0);
          // Navigate to the first image
          navigate(`/image-labeling/${unlabeledImages[0]._id}`, { replace: true });
          return;
        }
      }

      // If no images found, show a message
      console.log('No images found');
      showAlert('info', 'No unlabeled images found matching the selected criteria. Please check your filters or upload some images first.');
      setSetupMode(true);

    } catch (error) {
      console.error('Error loading images:', error);
      showAlert('error', 'Failed to load images for labeling. Please check that images exist in the system.');
      setSetupMode(true);
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (type: 'success' | 'error' | 'info', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleLabel = async (label: 'good' | 'bad') => {
    if (!currentImage || labeling) return;

    setLabeling(true);
    try {
      const image = currentImage;
      const updatedTags = [...image.tags];

      // Remove existing good/bad tags if any
      const filteredTags = updatedTags.filter(tag => tag !== 'good' && tag !== 'bad');

      // Add the new label
      filteredTags.push(label);

      await updateDatasetImage(image._id, { tags: filteredTags });

      // Update local state
      setImages(images.map(img =>
        img._id === image._id ? { ...img, tags: filteredTags } : img
      ));

      // Update session labels (always update, allowing changes)
      setSessionLabels(prev => ({
        ...prev,
        [image._id]: label
      }));

      // Auto-advance to next image
      if (currentImageIndex < images.length - 1) {
        const newIndex = currentImageIndex + 1;
        setCurrentImageIndex(newIndex);
        navigate(`/image-labeling/${images[newIndex]._id}`, { replace: true });
      }
    } catch (error) {
      showAlert('error', 'Failed to save label');
    } finally {
      setLabeling(false);
    }
  };

  const handleSkip = () => {
    if (!currentImage) return;

    // Update session labels to mark as skipped (always update, allowing changes)
    setSessionLabels(prev => ({
      ...prev,
      [currentImage._id]: 'skip'
    }));

    // Move to next image
    if (currentImageIndex < images.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      navigate(`/image-labeling/${images[newIndex]._id}`, { replace: true });
    }
  };

  const resetLabeling = () => {
    setSetupMode(true);
    setImages([]);
    setCurrentImageIndex(0);
    setSessionLabels({});
    setSelectedWeatherFilter('');
    setAlert(null);
    // Refresh statistics when returning to setup mode
    queryClient.invalidateQueries({ queryKey: ['overallLabelingMetrics'] });
  };

  // Navigation functions
  const handlePrevious = () => {
    if (currentImageIndex > 0) {
      const newIndex = currentImageIndex - 1;
      setCurrentImageIndex(newIndex);
      navigate(`/image-labeling/${images[newIndex]._id}`, { replace: true });
    }
  };

  const handleNext = () => {
    if (currentImageIndex < images.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      navigate(`/image-labeling/${images[newIndex]._id}`, { replace: true });
    }
  };

  const currentImage = images[currentImageIndex];
  const labeledCount = Object.keys(sessionLabels).length;
  const sessionProgress = images.length > 0 ? (labeledCount / images.length) * 100 : 0;

  // Handle URL parameter - set current image when imageId changes or images load
  React.useEffect(() => {
    if (images.length > 0) {
      if (imageId) {
        const imageIndex = images.findIndex(img => img._id === imageId);
        if (imageIndex !== -1 && imageIndex !== currentImageIndex) {
          setCurrentImageIndex(imageIndex);
        }
      } else if (!setupMode) {
        // No imageId in URL but we have images and are in labeling mode - navigate to first image
        navigate(`/image-labeling/${images[0]._id}`, { replace: true });
      }
    }
  }, [imageId, images, currentImageIndex, setupMode, navigate]);

  // Auto-start labeling when imageId is present in URL but no images are loaded
  React.useEffect(() => {
    if (imageId && setupMode && !loading && images.length === 0) {
      // We have an imageId in URL but no images loaded - start labeling automatically
      const autoStartLabeling = async () => {
        setLoading(true);
        setSetupMode(false);

        const showAlertLocal = (type: 'success' | 'error' | 'info', message: string) => {
          setAlert({ type, message });
          setTimeout(() => setAlert(null), 3000);
        };

        try {
          // Try to load all images first
          console.log('Auto-loading all images for direct URL access...');
          const response = await getAllImages(1, imageLimit, undefined, undefined, true, selectedWeatherFilter || undefined); // Enable randomization and weather filtering
          console.log('getAllImages response:', response);

          if (response.success && response.data.images) {
            const allImages = response.data.images;
            console.log('Total images found:', allImages.length);

            // Filter for unlabeled images (images with no tags) - backend should have already done weather filtering
            const unlabeledImages = allImages.filter((image: DatasetImage) =>
              !image.tags || image.tags.length === 0
            );

            console.log('Unlabeled images found:', unlabeledImages.length);
            console.log('Weather filter applied:', selectedWeatherFilter || 'none');

            if (unlabeledImages.length > 0) {
              // Since we already randomized at the database level, just take the first N
              const selectedImages = unlabeledImages.slice(0, imageLimit);
              console.log('Selected images for labeling (database-randomized):', selectedImages.length);

              setImages(selectedImages);
              // Don't set currentImageIndex here - let the other effect handle it
              return;
            }
          }

          // If getAllImages didn't work or returned no images, show a message
          console.log('No images found via getAllImages, trying alternative approach...');
          showAlertLocal('info', 'No unlabeled images found in the system. Please upload some images first.');
          setSetupMode(true);

        } catch (error) {
          console.error('Error auto-loading images:', error);
          showAlertLocal('error', 'Failed to load images for labeling. Please check that images exist in the system.');
          setSetupMode(true);
        } finally {
          setLoading(false);
        }
      };

      autoStartLabeling();
    }
  }, [imageId, setupMode, loading, images.length, imageLimit]);

  // Setup Mode
  if (setupMode) {
    return (
      <Container maxWidth="md">
        <Box sx={{ py: 4 }}>
          {/* Labeling Progress Overview */}
          {metricsLoading ? (
            <Paper sx={{ p: 3, mb: 4, backgroundColor: '#f8f9fa' }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
                <CircularProgress size={24} sx={{ mr: 2 }} />
                <Typography variant="body1">Loading statistics...</Typography>
              </Box>
            </Paper>
          ) : labelingMetrics ? (
            <Paper sx={{ p: 3, mb: 4, backgroundColor: '#f8f9fa' }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Overall Labeling Progress
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
                <Box sx={{ textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="success.main" fontWeight="bold">
                    {labelingMetrics.good.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    Good ({labelingMetrics.goodPercentage}%)
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="error.main" fontWeight="bold">
                    {labelingMetrics.bad.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="error.main">
                    Bad ({labelingMetrics.badPercentage}%)
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="warning.main" fontWeight="bold">
                    {labelingMetrics.unlabeled.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="warning.main">
                    Unlabeled ({labelingMetrics.unlabeledPercentage}%)
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center', minWidth: 120 }}>
                  <Typography variant="h4" color="primary.main" fontWeight="bold">
                    {labelingMetrics.total.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="primary.main">
                    Total Images
                  </Typography>
                </Box>
              </Box>
              
              {/* Progress Bar */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Labeling Completion: {labelingMetrics.good + labelingMetrics.bad} / {labelingMetrics.total} 
                  ({Math.round(((labelingMetrics.good + labelingMetrics.bad) / labelingMetrics.total) * 100)}%)
                </Typography>
                <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                  <Box 
                    sx={{ 
                      backgroundColor: 'success.main', 
                      width: `${(labelingMetrics.good / labelingMetrics.total) * 100}%` 
                    }} 
                  />
                  <Box 
                    sx={{ 
                      backgroundColor: 'error.main', 
                      width: `${(labelingMetrics.bad / labelingMetrics.total) * 100}%` 
                    }} 
                  />
                  <Box 
                    sx={{ 
                      backgroundColor: 'warning.main', 
                      width: `${(labelingMetrics.unlabeled / labelingMetrics.total) * 100}%` 
                    }} 
                  />
                </Box>
              </Box>
            </Paper>
          ) : null}

          <Box sx={{ textAlign: 'center' }}>
            <Paper elevation={2} sx={{ p: 4, mb: 3, maxWidth: 400, mx: 'auto' }}>
              <Typography variant="h5" sx={{ mb: 3 }}>
                Image Labeling Setup
              </Typography>
              
              <TextField
                fullWidth
                type="number"
                label="Number of images to label"
                value={imageLimit}
                onChange={(e) => setImageLimit(Math.max(1, Number(e.target.value) || 1))}
                inputProps={{ min: 1 }}
                sx={{ mb: 3 }}
                helperText="Maximum number of unlabeled images to load for this session (randomly selected from database for optimal diversity)"
              />

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Weather Condition (Optional)</InputLabel>
                <Select
                  value={selectedWeatherFilter}
                  onChange={(e) => setSelectedWeatherFilter(e.target.value as WeatherCondition | '')}
                  label="Weather Condition (Optional)"
                >
                  <MenuItem value="">
                    <em>All Weather Conditions</em>
                  </MenuItem>
                  {WEATHER_CONDITIONS.map((condition) => (
                    <MenuItem key={condition.value} value={condition.value}>
                      {condition.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrowIcon />}
                onClick={startLabeling}
                disabled={loading || imageLimit < 1}
                fullWidth
                sx={{ py: 2 }}
              >
                {loading ? 'Loading Images...' : `Start Labeling`}
              </Button>
            </Paper>

            {alert && (
              <Alert severity={alert.type} sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
                {alert.message}
              </Alert>
            )}
          </Box>
        </Box>
      </Container>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="md">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Loading {imageLimit} images for labeling...
          </Typography>
        </Box>
      </Container>
    );
  }

  // No images state
  if (images.length === 0) {
    return (
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h5" color="text.secondary">
            No images available for labeling
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            Please check that images exist in the dataset.
          </Typography>
          <Button variant="outlined" onClick={resetLabeling} sx={{ mt: 2 }}>
            Back to Setup
          </Button>
        </Box>
      </Container>
    );
  }

  // Labeling interface
  return (
    <Box sx={{ width: '100vw', height: '90vh', p: 0, m: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header - Fixed height */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 0.5, flexShrink: 0, minHeight: 40 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<NavigateBeforeIcon />}
            onClick={handlePrevious}
            disabled={currentImageIndex === 0}
          >
            Previous
          </Button>
          <Button
            variant="outlined"
            size="small"
            endIcon={<NavigateNextIcon />}
            onClick={handleNext}
            disabled={currentImageIndex === images.length - 1}
          >
            Next
          </Button>
        </Box>
        <Button variant="outlined" onClick={resetLabeling} size="small">
          Change Settings
        </Button>
      </Box>

      {/* Progress Bar - Fixed height */}
      <Box sx={{ px: 2, pb: 0.5, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 0.25 }}>
          Image {currentImageIndex + 1} of {images.length} • Labeled: {labeledCount} of {images.length}
        </Typography>
        <LinearProgress variant="determinate" value={sessionProgress} sx={{ height: 6, borderRadius: 3 }} />
      </Box>

      {/* Image Area - Takes remaining space but leaves room for buttons */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: 'calc(90vh - 140px)' }}>
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', px: 2, pb: 1, minHeight: 0 }}>
          <Card sx={{ width: '100%', height: '100%', boxShadow: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <CardMedia
              component="img"
              sx={{ flex: 1, objectFit: 'contain', minHeight: 0 }}
              image={currentImage.signedUrl || currentImage.thumbnailSignedUrl}
              alt={currentImage.title || currentImage.originalName}
            />
            <CardContent sx={{ pb: 0.5, pt: 0.5, flexShrink: 0, minHeight: 60 }}>
              <Typography variant="h6" align="center" sx={{ fontSize: '1rem', mb: 0.25 }}>
                {currentImage.title || currentImage.originalName}
              </Typography>
              {currentImage.description && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ fontSize: '0.9rem', mb: 0.25 }}>
                  {currentImage.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.25, minHeight: 24 }}>
                {(() => {
                  const sessionLabel = sessionLabels[currentImage?._id];
                  if (sessionLabel) {
                    return (
                      <Typography key={sessionLabel} variant="caption" sx={{
                        mx: 0.3,
                        px: 0.8,
                        py: 0.3,
                        bgcolor: sessionLabel === 'good' ? 'success.light' : sessionLabel === 'bad' ? 'error.light' : 'grey.300',
                        borderRadius: 1,
                        color: 'white',
                        fontSize: '0.7rem'
                      }}>
                        {sessionLabel === 'skip' ? 'Skipped' : sessionLabel}
                      </Typography>
                    );
                  }
                  return null;
                })()}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Labeling Buttons - Fixed at bottom, always visible */}
      <Box sx={{ flexShrink: 0, backgroundColor: 'background.paper', py: 1, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, mb: 0.5, position: 'relative' }}>
          <Button
            variant="contained"
            color="success"
            size="large"
            startIcon={<ThumbUpIcon />}
            onClick={() => handleLabel('good')}
            disabled={labeling}
            sx={{ minWidth: 100, py: 1.5, fontSize: '0.9rem' }}
          >
            Good
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => handleSkip()}
            disabled={labeling}
            sx={{ minWidth: 100, py: 1.5, fontSize: '0.9rem' }}
          >
            Skip
          </Button>
          <Button
            variant="contained"
            color="error"
            size="large"
            startIcon={<ThumbDownIcon />}
            onClick={() => handleLabel('bad')}
            disabled={labeling}
            sx={{ minWidth: 100, py: 1.5, fontSize: '0.9rem' }}
          >
            Bad
          </Button>
          
          {/* Loading overlay when labeling */}
          {labeling && (
            <Box sx={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              borderRadius: 1
            }}>
              <CircularProgress size={24} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ImageLabelingPage;