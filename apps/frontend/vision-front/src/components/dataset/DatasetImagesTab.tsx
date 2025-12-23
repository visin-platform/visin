import React from 'react';
import {
  Box,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
  Chip,
  CircularProgress,
  Card,
  CardMedia,
  CardContent,
  IconButton
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon
} from '@mui/icons-material';
import { DatasetImage, ImageCategory, WeatherCondition } from '../../services/datasetImageService';

// Weather condition options
const WEATHER_CONDITIONS: { value: WeatherCondition; label: string }[] = [
  { value: 'day_fair', label: 'Day Fair' },
  { value: 'night_fair', label: 'Night Fair' },
  { value: 'day_rain', label: 'Day Rain' },
  { value: 'night_rain', label: 'Night Rain' },
  { value: 'snow', label: 'Snow' }
];

interface DatasetImagesTabProps {
  images: DatasetImage[];
  pagination: { page: number; limit: number; total: number; pages: number };
  isLoading: boolean;
  error: any;
  filters: {
    category: string;
    tags: string[];
    weather: WeatherCondition | '';
  };
  updateFilter: (key: 'category' | 'tags' | 'weather', value: any) => void;
  categories: ImageCategory[];
  availableTags: string[];
  onImageClick: (image: DatasetImage) => void;
  onEditImage: (image: DatasetImage) => void;
  onDeleteImage: (id: string) => void;
  deletingImageId: string | null;
  canDelete: boolean;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  onUploadClick: () => void;
}

const DatasetImagesTab: React.FC<DatasetImagesTabProps> = ({
  images,
  pagination,
  isLoading,
  error,
  filters,
  updateFilter,
  categories,
  availableTags,
  onImageClick,
  onEditImage,
  onDeleteImage,
  deletingImageId,
  canDelete,
  page,
  setPage,
  pageSize,
  setPageSize,
  onUploadClick
}) => {
  const handlePreviousPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < pagination.pages) setPage(page + 1);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6">
            Images ({pagination.total.toLocaleString()})
          </Typography>
        </Box>
        {canDelete && (
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={onUploadClick}
          >
            Upload Images
          </Button>
        )}
      </Box>

      {/* Category Filter */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Category</InputLabel>
          <Select
            value={filters.category}
            onChange={(e) => updateFilter('category', e.target.value)}
            label="Filter by Category"
          >
            <MenuItem value="">
              <em>All Categories</em>
            </MenuItem>
            {categories.map((category) => (
              <MenuItem key={category._id} value={category._id}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: category.color || '#1976d2',
                      mr: 1
                    }}
                  />
                  {category.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Weather</InputLabel>
          <Select
            value={filters.weather}
            onChange={(e) => updateFilter('weather', e.target.value)}
            label="Filter by Weather"
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

        <Autocomplete
          multiple
          size="small"
          options={availableTags}
          value={filters.tags}
          onChange={(_, newValue) => updateFilter('tags', newValue)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Filter by Tags"
              placeholder="Select tags..."
              sx={{ minWidth: 200 }}
              helperText="Select one or more tags to filter images"
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={option}
                label={option}
                size="small"
              />
            ))
          }
          sx={{ minWidth: 200 }}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Loading images...
          </Typography>
        </Box>
      ) : error ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            Images not available
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This analysis dataset doesn't have associated images in the image management system. 
            Upload images separately to enable image labeling and categorization.
          </Typography>
        </Box>
      ) : images.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No images available
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Images will be displayed here once uploaded to the dataset.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)'
            },
            gap: 2
          }}
        >
          {images.map((image: DatasetImage) => {
            const hasGoodLabel = image.tags.some(tag => 
              tag.toLowerCase().includes('good') || tag === 'good_annotations'
            );
            const hasBadLabel = image.tags.some(tag => 
              tag.toLowerCase().includes('bad') || tag === 'bad_annotations'
            );
            
            let statusColor = 'warning.main'; // unlabeled
            let statusText = 'Unlabeled';
            
            if (hasGoodLabel) {
              statusColor = 'success.main';
              statusText = 'Good';
            } else if (hasBadLabel) {
              statusColor = 'error.main';
              statusText = 'Bad';
            }
            
            return (
              <Card key={image._id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ position: 'relative' }}>
                  <CardMedia
                    component="img"
                    height="200"
                    image={image.thumbnailSignedUrl || image.signedUrl}
                    alt={image.title || image.originalName}
                    sx={{ objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => onImageClick(image)}
                  />
                  
                  {/* Status indicator */}
                  <Chip
                    label={statusText}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 50, // Leave space for action buttons
                      backgroundColor: statusColor,
                      color: 'white',
                      fontSize: '0.7rem',
                      height: 20
                    }}
                  />
                  
                  {canDelete && (
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditImage(image);
                      }}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        bgcolor: 'rgba(25, 118, 210, 0.8)',
                        color: 'white',
                        '&:hover': {
                          bgcolor: 'rgba(21, 101, 192, 0.9)',
                        },
                      }}
                      size="small"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                  {canDelete && (
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteImage(image._id);
                      }}
                      disabled={deletingImageId === image._id}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: 'rgba(244, 67, 54, 0.8)',
                        color: 'white',
                        '&:hover': {
                          bgcolor: 'rgba(211, 47, 47, 0.9)',
                        },
                        '&:disabled': {
                          bgcolor: 'rgba(244, 67, 54, 0.4)',
                        },
                      }}
                      size="small"
                    >
                      {deletingImageId === image._id ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <DeleteIcon fontSize="small" />
                      )}
                    </IconButton>
                  )}
                </Box>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="subtitle2" noWrap>
                    {image.title || image.originalName}
                  </Typography>
                  {image.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {image.description}
                    </Typography>
                  )}
                  <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {image.tags.slice(0, 2).map((tag, index) => (
                      <Chip key={index} label={tag} size="small" variant="outlined" />
                    ))}
                    {image.tags.length > 2 && (
                      <Chip label={`+${image.tags.length - 2}`} size="small" variant="outlined" />
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Pagination */}
      {images.length > 0 && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Show:
            </Typography>
            <Select
              size="small"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              sx={{ minWidth: 80 }}
            >
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
            </Select>
          </Box>

          <Button
            variant="outlined"
            onClick={handlePreviousPage}
            disabled={page <= 1}
            startIcon={<ArrowBackIcon />}
          >
            Previous
          </Button>

          <Typography variant="body2" color="text.secondary">
            Page {pagination.page} of {pagination.pages} (Total: {pagination.total.toLocaleString()} images)
          </Typography>

          <Button
            variant="outlined"
            onClick={handleNextPage}
            disabled={page >= pagination.pages}
            endIcon={<ArrowForwardIcon />}
          >
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default DatasetImagesTab;
