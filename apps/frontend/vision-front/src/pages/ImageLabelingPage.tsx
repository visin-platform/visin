import React from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { usePageTitle } from '../hooks/usePageTitle';
import { useImageLabeling } from '../hooks/useImageLabeling';
import LabelingMetrics from '../components/labeling/LabelingMetrics';
import LabelingSetup from '../components/labeling/LabelingSetup';
import LabelingHeader from '../components/labeling/LabelingHeader';
import LabelingProgress from '../components/labeling/LabelingProgress';
import ImageDisplay from '../components/labeling/ImageDisplay';
import LabelingControls from '../components/labeling/LabelingControls';
import LabelingSettingsDialog from '../components/labeling/LabelingSettingsDialog';

const ImageLabelingPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Set page title
  usePageTitle('Image Labeling - Vision');

  const {
    images,
    currentImageIndex,
    loading,
    labeling,
    alert,
    setupMode,
    imageLimit,
    setImageLimit,
    settingsOpen,
    setSettingsOpen,
    selectedWeatherFilter,
    setSelectedWeatherFilter,
    sessionLabels,
    labelingMetrics,
    metricsLoading,
    WEATHER_CONDITIONS,
    startLabeling,
    handleLabel,
    handleSkip,
    resetLabeling,
    handlePrevious,
    handleNext
  } = useImageLabeling();

  const currentImage = images[currentImageIndex];
  const labeledCount = Object.keys(sessionLabels).length;
  const sessionProgress = images.length > 0 ? (labeledCount / images.length) * 100 : 0;

  // Setup Mode
  if (setupMode) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
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
        <LabelingMetrics loading={metricsLoading} metrics={labelingMetrics} />

        <LabelingSetup
          imageLimit={imageLimit}
          setImageLimit={setImageLimit}
          selectedWeatherFilter={selectedWeatherFilter}
          setSelectedWeatherFilter={setSelectedWeatherFilter}
          startLabeling={startLabeling}
          loading={loading}
          weatherConditions={WEATHER_CONDITIONS}
        />

        {alert && (
          <Alert severity={alert.type} sx={{ mb: 3, maxWidth: 400, mx: 'auto', borderRadius: 2 }}>
            {alert.message}
          </Alert>
        )}
      </Container>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
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
      <Container maxWidth="xl" sx={{ pb: 4 }}>
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
      <LabelingHeader
        handlePrevious={handlePrevious}
        handleNext={handleNext}
        currentImageIndex={currentImageIndex}
        totalImages={images.length}
        isMobile={isMobile}
        setSettingsOpen={setSettingsOpen}
      />

      <LabelingProgress
        currentImageIndex={currentImageIndex}
        totalImages={images.length}
        labeledCount={labeledCount}
        sessionProgress={sessionProgress}
      />

      <ImageDisplay
        currentImage={currentImage}
        sessionLabels={sessionLabels}
      />

      <LabelingControls
        handleLabel={handleLabel}
        handleSkip={handleSkip}
        labeling={labeling}
        isMobile={isMobile}
      />

      <LabelingSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        imageLimit={imageLimit}
        setImageLimit={setImageLimit}
        selectedWeatherFilter={selectedWeatherFilter}
        setSelectedWeatherFilter={setSelectedWeatherFilter}
        resetLabeling={resetLabeling}
        weatherConditions={WEATHER_CONDITIONS}
      />
    </Box>
  );
};

export default ImageLabelingPage;
