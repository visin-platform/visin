import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  Box,
  Chip,
  Button
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { Visualization } from '../../types';

interface ImageViewDialogProps {
  open: boolean;
  onClose: () => void;
  selectedImage: Visualization | null;
}

const ImageViewDialog: React.FC<ImageViewDialogProps> = ({
  open,
  onClose,
  selectedImage
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xl" 
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2, bgcolor: 'black' } } }}
    >
      <DialogTitle sx={{ color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" component="span">{selectedImage?.filename}</Typography>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
        {selectedImage && (
          <Box
            component="img"
            src={selectedImage.signedUrl || ''}
            alt={selectedImage.filename}
            sx={{
              width: '100%',
              height: '85vh',
              objectFit: 'contain'
            }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ bgcolor: 'black', p: 2 }}>
        {selectedImage && (
          <Box
            sx={{
              display: "flex",
              gap: 2,
              mr: "auto"
            }}>
            <Chip label={selectedImage.type} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            <Chip label={`Epoch ${selectedImage.epoch}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
          </Box>
        )}
        <Button onClick={onClose} sx={{ color: 'white' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImageViewDialog;
