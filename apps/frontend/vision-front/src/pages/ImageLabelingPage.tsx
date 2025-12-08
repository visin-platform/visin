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
  MenuItem,
  useTheme,
  useMediaQuery,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [labeling, setLabeling] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [setupMode, setSetupMode] = useState(true);
  const [imageLimit, setImageLimit] = useState(100);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    setSettingsOpen(false);
    // Navigate back to setup mode
    navigate('/image-labeling', { replace: true });
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
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Image Labeling
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Label images to improve dataset quality for better model training results
          </Typography>
        </Box>

        {/* Labeling Progress Overview */}
        {metricsLoading ? (
          <Paper 
            sx={{ 
              p: { xs: 2, md: 3 }, 
              mb: 3,
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
              textAlign: 'center'
            }}
          >
            <CircularProgress size={24} sx={{ mb: 1 }} />
            <Typography variant="body1" sx={{ fontWeight: 500 }}>Loading statistics...</Typography>
          </Paper>
        ) : labelingMetrics ? (
          <Paper 
            sx={{ 
              p: { xs: 2, md: 3 }, 
              mb: 3,
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
            }}
          >
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
              Labeling Progress
            </Typography>
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, 
              gap: 2, 
              mb: 2 
            }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="success.main" fontWeight="bold">
                  {labelingMetrics.good.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="success.main" fontWeight={500} display="block">
                  Good ({labelingMetrics.goodPercentage}%)
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="error.main" fontWeight="bold">
                  {labelingMetrics.bad.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="error.main" fontWeight={500} display="block">
                  Bad ({labelingMetrics.badPercentage}%)
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="warning.main" fontWeight="bold">
                  {labelingMetrics.unlabeled.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="warning.main" fontWeight={500} display="block">
                  Unlabeled ({labelingMetrics.unlabeledPercentage}%)
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h5" color="primary.main" fontWeight="bold">
                  {labelingMetrics.total.toLocaleString()}
                </Typography>
                <Typography variant="caption" color="primary.main" fontWeight={500} display="block">
                  Total
                </Typography>
              </Box>
            </Box>
            
            {/* Progress Bar */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1, textAlign: 'center', fontWeight: 500, fontSize: '0.8rem' }}>
                Completion: {labelingMetrics.good + labelingMetrics.bad} / {labelingMetrics.total} 
                ({Math.round(((labelingMetrics.good + labelingMetrics.bad) / labelingMetrics.total) * 100)}%)
              </Typography>
              <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
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
          <Paper 
            elevation={0} 
            sx={{ 
              p: { xs: 3, md: 5 }, 
              mb: 3, 
              maxWidth: 500, 
              mx: 'auto',
              boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
              borderRadius: 3
            }}
          >
            <Typography variant="h5" sx={{ mb: 4, fontWeight: 600 }}>
              Image Labeling Setup
            </Typography>
            
            <TextField
              fullWidth
              type="number"
              label="Number of images to label"
              value={imageLimit}
              onChange={(e) => setImageLimit(Math.max(1, Number(e.target.value) || 1))}
              inputProps={{ min: 1 }}
              sx={{ mb: 4 }}
              helperText="Maximum number of unlabeled images to load for this session"
              variant="outlined"
            />

            <FormControl fullWidth sx={{ mb: 4 }}>
              <InputLabel>Weather Condition (Optional)</InputLabel>
              <Select
                value={selectedWeatherFilter}
                onChange={(e) => setSelectedWeatherFilter(e.target.value as WeatherCondition | '')}
                label="Weather Condition (Optional)"
                variant="outlined"
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
              sx={{ py: 2, fontSize: '1.1rem', fontWeight: 600, borderRadius: 2 }}
            >
              {loading ? 'Loading Images...' : `Start Labeling`}
            </Button>
          </Paper>

          {alert && (
            <Alert severity={alert.type} sx={{ mb: 3, maxWidth: 400, mx: 'auto', borderRadius: 2 }}>
              {alert.message}
            </Alert>
          )}
        </Box>
      </Container>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CircularProgress size={48} sx={{ mb: 3 }} />
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
            Loading {imageLimit} images for labeling...
          </Typography>
          <Typography variant="body1" color="text.secondary">
            This may take a moment depending on the number of images selected
          </Typography>
        </Box>
      </Container>
    );
  }

  // No images state
  if (images.length === 0) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h5" color="text.secondary" sx={{ mb: 2, fontWeight: 600 }}>
            No images available for labeling
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Please check that images exist in the dataset and try adjusting your filters.
          </Typography>
          <Button 
            variant="contained" 
            onClick={resetLabeling} 
            size="large"
            sx={{ px: 4, py: 1.5, fontWeight: 600 }}
          >
            Back to Setup
          </Button>
        </Box>
      </Container>
    );
  }

  // Labeling interface
  return (
    <Box sx={{ 
      width: { xs: 'calc(100% + 32px)', sm: 'calc(100% + 64px)' }, 
      height: { xs: 'calc(100vh - 56px)', sm: '100vh' }, 
      mx: { xs: -2, sm: -4 }, 
      my: { xs: -2, sm: -4 },
      overflow: 'hidden', 
      display: 'flex', 
      flexDirection: 'column', 
      bgcolor: 'background.default' 
    }}>
      {/* Header - Ultra compact modern styling */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        px: { xs: 1, sm: 2 }, 
        py: 1, 
        flexShrink: 0, 
        minHeight: 48,
        bgcolor: 'background.paper',
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        boxShadow: `0 1px 4px ${alpha(theme.palette.common.black, 0.08)}`
      }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<NavigateBeforeIcon />}
            onClick={handlePrevious}
            disabled={currentImageIndex === 0}
            sx={{ 
              fontWeight: 500, 
              py: 0.5, 
              px: { xs: 1, sm: 1.5 }, 
              fontSize: '0.875rem',
              minWidth: { xs: 0, sm: 64 }
            }}
          >
            {isMobile ? 'Prev' : 'Previous'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            endIcon={<NavigateNextIcon />}
            onClick={handleNext}
            disabled={currentImageIndex === images.length - 1}
            sx={{ 
              fontWeight: 500, 
              py: 0.5, 
              px: { xs: 1, sm: 1.5 }, 
              fontSize: '0.875rem',
              minWidth: { xs: 0, sm: 64 }
            }}
          >
            {isMobile ? 'Next' : 'Next'}
          </Button>
        </Box>
        
        <Typography 
          variant="subtitle1" 
          sx={{ 
            fontWeight: 600, 
            color: 'text.primary', 
            fontSize: '0.95rem',
            display: { xs: 'none', sm: 'block' }
          }}
        >
          Image Labeling
        </Typography>
        
        <Button 
          variant="outlined" 
          onClick={() => setSettingsOpen(true)} 
          size="small"
          sx={{ fontWeight: 500, py: 0.5, px: 1.5, fontSize: '0.875rem' }}
        >
          Settings
        </Button>
      </Box>

      {/* Progress Bar - Ultra compact */}
      <Box sx={{ 
        px: { xs: 1, sm: 2 }, 
        py: 0.75, 
        flexShrink: 0,
        bgcolor: alpha(theme.palette.primary.main, 0.02),
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
            {currentImageIndex + 1} / {images.length}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
            Labeled: {labeledCount}
          </Typography>
        </Box>
        <LinearProgress 
          variant="determinate" 
          value={sessionProgress} 
          sx={{ 
            height: 4, 
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            '& .MuiLinearProgress-bar': {
              borderRadius: 2,
              backgroundColor: theme.palette.primary.main
            }
          }} 
        />
      </Box>

      {/* Image Area - Ultra compact */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, px: { xs: 1, sm: 2 }, py: 0.5 }}>
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', minHeight: 0 }}>
          <Card sx={{ 
            width: '100%', 
            maxWidth: '1200px',
            height: '100%', 
            boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.1)}`,
            borderRadius: 2,
            display: 'flex', 
            flexDirection: 'column', 
            minHeight: 0,
            border: `1px solid ${alpha(theme.palette.divider, 0.08)}`
          }}>
            <CardMedia
              component="img"
              sx={{ 
                flex: 1, 
                objectFit: 'contain', 
                minHeight: 0,
                borderRadius: '8px 8px 0 0',
                bgcolor: '#00000005' // Slight background to see image boundaries
              }}
              image={currentImage.signedUrl || currentImage.thumbnailSignedUrl}
              alt={currentImage.title || currentImage.originalName}
            />
            <CardContent sx={{ 
              pb: 1, 
              pt: 1.5, 
              flexShrink: 0, 
              minHeight: 60,
              bgcolor: alpha(theme.palette.background.paper, 0.9),
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.08)}`
            }}>
              <Typography variant="subtitle1" align="center" sx={{ fontSize: '0.95rem', mb: 0.25, fontWeight: 600, lineHeight: 1.2 }} noWrap>
                {currentImage.title || currentImage.originalName}
              </Typography>
              {currentImage.description && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ fontSize: '0.8rem', mb: 0.75, lineHeight: 1.3 }} noWrap>
                  {currentImage.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.25 }}>
                {(() => {
                  const sessionLabel = sessionLabels[currentImage?._id];
                  if (sessionLabel) {
                    return (
                      <Typography key={sessionLabel} variant="caption" sx={{
                        px: 1,
                        py: 0.25,
                        bgcolor: sessionLabel === 'good' ? alpha(theme.palette.success.main, 0.9) : 
                               sessionLabel === 'bad' ? alpha(theme.palette.error.main, 0.9) : 
                               alpha(theme.palette.warning.main, 0.9),
                        borderRadius: 1.5,
                        color: 'white',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.3
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

      {/* Labeling Buttons - Ultra compact */}
      <Box sx={{ 
        flexShrink: 0, 
        bgcolor: 'background.paper', 
        py: 1.5, 
        px: { xs: 1, sm: 2 },
        borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
        boxShadow: `0 -2px 8px ${alpha(theme.palette.common.black, 0.05)}`
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: { xs: 1, sm: 3 }, position: 'relative' }}>
          <Button
            variant="contained"
            color="success"
            size="medium"
            startIcon={!isMobile ? <ThumbUpIcon /> : undefined}
            onClick={() => handleLabel('good')}
            disabled={labeling}
            sx={{ 
              minWidth: { xs: 0, sm: 100 },
              flex: { xs: 1, sm: 'none' },
              py: 1, 
              fontSize: '0.9rem', 
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: `0 2px 8px ${alpha(theme.palette.success.main, 0.25)}`,
              '&:hover': {
                boxShadow: `0 4px 12px ${alpha(theme.palette.success.main, 0.35)}`,
                transform: 'translateY(-1px)'
              },
              transition: 'all 0.15s ease'
            }}
          >
            {isMobile ? <ThumbUpIcon fontSize="small" /> : 'Good'}
          </Button>
          <Button
            variant="outlined"
            size="medium"
            onClick={() => handleSkip()}
            disabled={labeling}
            sx={{ 
              minWidth: { xs: 0, sm: 100 },
              flex: { xs: 1, sm: 'none' },
              py: 1, 
              fontSize: '0.9rem',
              fontWeight: 600,
              borderRadius: 2,
              borderWidth: 1.5,
              '&:hover': {
                borderWidth: 1.5,
                boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
                transform: 'translateY(-1px)'
              },
              transition: 'all 0.15s ease'
            }}
          >
            Skip
          </Button>
          <Button
            variant="contained"
            color="error"
            size="medium"
            startIcon={!isMobile ? <ThumbDownIcon /> : undefined}
            onClick={() => handleLabel('bad')}
            disabled={labeling}
            sx={{ 
              minWidth: { xs: 0, sm: 100 },
              flex: { xs: 1, sm: 'none' },
              py: 1, 
              fontSize: '0.9rem', 
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: `0 2px 8px ${alpha(theme.palette.error.main, 0.25)}`,
              '&:hover': {
                boxShadow: `0 4px 12px ${alpha(theme.palette.error.main, 0.35)}`,
                transform: 'translateY(-1px)'
              },
              transition: 'all 0.15s ease'
            }}
          >
            {isMobile ? <ThumbDownIcon fontSize="small" /> : 'Bad'}
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
              backgroundColor: alpha(theme.palette.background.paper, 0.9),
              borderRadius: 2,
              zIndex: 10
            }}>
              <Box sx={{ textAlign: 'center' }}>
                <CircularProgress size={24} sx={{ mb: 0.5 }} />
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                  Saving...
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Settings Modal */}
      <Dialog 
        open={settingsOpen} 
        onClose={() => setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: 2,
            boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.3)}`
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>
          Labeling Settings
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Adjust your labeling preferences and return to setup if needed.
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              type="number"
              label="Number of images to label"
              value={imageLimit}
              onChange={(e) => setImageLimit(Math.max(1, Number(e.target.value) || 1))}
              inputProps={{ min: 1 }}
              helperText="Maximum number of unlabeled images to load for this session"
              size="small"
            />

            <FormControl fullWidth size="small">
              <InputLabel>Weather Condition Filter</InputLabel>
              <Select
                value={selectedWeatherFilter}
                onChange={(e) => setSelectedWeatherFilter(e.target.value as WeatherCondition | '')}
                label="Weather Condition Filter"
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
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1 }}>
          <Button 
            onClick={() => setSettingsOpen(false)}
            variant="outlined"
            size="small"
          >
            Cancel
          </Button>
          <Button 
            onClick={resetLabeling}
            variant="contained"
            size="small"
            sx={{ fontWeight: 600 }}
          >
            Return to Setup
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ImageLabelingPage;