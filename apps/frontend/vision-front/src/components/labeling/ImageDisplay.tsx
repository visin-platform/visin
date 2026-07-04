import React from 'react';
import {
  Box,
  Card,
  CardMedia,
  CardContent,
  Typography,
  alpha,
  useTheme
} from '@mui/material';
import { DatasetImage } from '../../services/datasetImageService';

interface ImageDisplayProps {
  currentImage: DatasetImage;
  sessionLabels: Record<string, 'good' | 'bad' | 'skip'>;
}

const ImageDisplay: React.FC<ImageDisplayProps> = ({ currentImage, sessionLabels }) => {
  const theme = useTheme();

  return (
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
              <Typography
                variant="body2"
                align="center"
                noWrap
                sx={{
                  color: "text.secondary",
                  fontSize: '0.8rem',
                  mb: 0.75,
                  lineHeight: 1.3
                }}>
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
  );
};

export default ImageDisplay;
