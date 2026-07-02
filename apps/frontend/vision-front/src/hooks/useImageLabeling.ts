import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DatasetImage,
  getAllImages,
  updateDatasetImage,
  getLabelingStats,
  WeatherCondition
} from '../services/datasetImageService';

export const useImageLabeling = () => {
  const { imageId } = useParams<{ imageId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [images, setImages] = useState<DatasetImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [labeling, setLabeling] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [setupMode, setSetupMode] = useState(true);
  const [imageLimit, setImageLimit] = useState(100);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedWeatherFilter, setSelectedWeatherFilter] = useState<WeatherCondition | ''>('');
  const [sessionLabels, setSessionLabels] = useState<Record<string, 'good' | 'bad' | 'skip'>>({});

  const WEATHER_CONDITIONS: { value: WeatherCondition; label: string }[] = [
    { value: 'day_fair', label: 'Day Fair' },
    { value: 'night_fair', label: 'Night Fair' },
    { value: 'day_rain', label: 'Day Rain' },
    { value: 'night_rain', label: 'Night Rain' },
    { value: 'snow', label: 'Snow' }
  ];

  const { data: labelingMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['overallLabelingMetrics'],
    queryFn: async () => {
      return await getLabelingStats();
    },
    retry: false,
  });

  const showAlert = (type: 'success' | 'error' | 'info', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 3000);
  };

  const startLabeling = async () => {
    if (imageLimit < 1) {
      showAlert('error', 'Please enter a number greater than 0');
      return;
    }

    setLoading(true);
    setSetupMode(false);

    try {
      const response = await getAllImages(1, imageLimit, undefined, undefined, true, selectedWeatherFilter || undefined);

      if (response.success && response.data.images) {
        const allImages = response.data.images;
        const unlabeledImages = allImages.filter((image: DatasetImage) =>
          !image.tags || image.tags.length === 0
        );

        if (unlabeledImages.length > 0) {
          setImages(unlabeledImages);
          setCurrentImageIndex(0);
          navigate(`/image-labeling/${unlabeledImages[0]._id}`, { replace: true });
          return;
        }
      }

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

  const handleLabel = async (label: 'good' | 'bad') => {
    const currentImage = images[currentImageIndex];
    if (!currentImage || labeling) return;

    setLabeling(true);
    try {
      const updatedTags = [...currentImage.tags];
      const filteredTags = updatedTags.filter(tag => tag !== 'good' && tag !== 'bad');
      filteredTags.push(label);

      await updateDatasetImage(currentImage._id, { tags: filteredTags });

      setImages(images.map(img =>
        img._id === currentImage._id ? { ...img, tags: filteredTags } : img
      ));

      setSessionLabels(prev => ({
        ...prev,
        [currentImage._id]: label
      }));

      if (currentImageIndex < images.length - 1) {
        const newIndex = currentImageIndex + 1;
        setCurrentImageIndex(newIndex);
        navigate(`/image-labeling/${images[newIndex]._id}`, { replace: true });
      }
    } catch {
      showAlert('error', 'Failed to save label');
    } finally {
      setLabeling(false);
    }
  };

  const handleSkip = () => {
    const currentImage = images[currentImageIndex];
    if (!currentImage) return;

    setSessionLabels(prev => ({
      ...prev,
      [currentImage._id]: 'skip'
    }));

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
    navigate('/image-labeling', { replace: true });
    queryClient.invalidateQueries({ queryKey: ['overallLabelingMetrics'] });
  };

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

  useEffect(() => {
    if (images.length > 0) {
      if (imageId) {
        const imageIndex = images.findIndex(img => img._id === imageId);
        if (imageIndex !== -1 && imageIndex !== currentImageIndex) {
          setCurrentImageIndex(imageIndex);
        }
      } else if (!setupMode) {
        navigate(`/image-labeling/${images[0]._id}`, { replace: true });
      }
    }
  }, [imageId, images, currentImageIndex, setupMode, navigate]);

  useEffect(() => {
    if (imageId && setupMode && !loading && images.length === 0) {
      const autoStartLabeling = async () => {
        setLoading(true);
        setSetupMode(false);

        const showAlertLocal = (type: 'success' | 'error' | 'info', message: string) => {
          setAlert({ type, message });
          setTimeout(() => setAlert(null), 3000);
        };

        try {
          const response = await getAllImages(1, imageLimit, undefined, undefined, true, selectedWeatherFilter || undefined);

          if (response.success && response.data.images) {
            const allImages = response.data.images;
            const unlabeledImages = allImages.filter((image: DatasetImage) =>
              !image.tags || image.tags.length === 0
            );

            if (unlabeledImages.length > 0) {
              const selectedImages = unlabeledImages.slice(0, imageLimit);
              setImages(selectedImages);
              return;
            }
          }

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

  return {
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
  };
};
