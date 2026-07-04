import React from 'react';
import { Box, Dialog, DialogContent, IconButton } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { DatasetImage } from '../../services/datasetImageService';

interface ImageLightboxDialogProps {
  open: boolean;
  image: DatasetImage | null;
  onClose: () => void;
}

const ImageLightboxDialog: React.FC<ImageLightboxDialogProps> = ({ open, image, onClose }) => (
  <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
    <DialogContent sx={{ p: 0, position: 'relative', height: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <IconButton
        onClick={onClose}
        sx={{ position: 'absolute', right: 8, top: 8, bgcolor: 'rgba(0, 0, 0, 0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.7)' }, zIndex: 1 }}
      >
        <CloseIcon />
      </IconButton>
      {image && (
        <Box
          component="img"
          src={image.signedUrl}
          alt={image.title || image.originalName}
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </DialogContent>
  </Dialog>
);

export default ImageLightboxDialog;
