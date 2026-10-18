import React, { useState } from 'react';
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
import { onImage } from '@visin/frontend-core';
import { Visualization } from '../../types';
import { isDecodedKind, isOutputKind, OUTPUT_KIND_LABELS, type OutputClass } from '../../utils/outputPixels';
import OutputImage from './OutputImage';
import OutputLegend from './OutputLegend';

interface ImageViewDialogProps {
  open: boolean;
  onClose: () => void;
  selectedImage: Visualization | null;
  /** the classes a mask's indices stand for */
  classes?: OutputClass[];
}

/** One image at full size, with how to read it. Its own component so the readout starts afresh for each image. */
const Viewer: React.FC<{ image: Visualization; classes?: OutputClass[]; onClose: () => void }> = ({
  image,
  classes,
  onClose
}) => {
  const [reading, setReading] = useState<string | null>(null);
  const [present, setPresent] = useState<number[]>([]);
  const decoded = isDecodedKind(image.type) ? image.type : undefined;
  const kindLabel = isOutputKind(image.type) ? OUTPUT_KIND_LABELS[image.type] : image.type;

  return (
    <>
      <DialogContent sx={{ p: 0, display: 'flex', justifyContent: 'center', bgcolor: onImage.backdrop }}>
        <OutputImage
          visualization={image}
          classes={classes}
          onPixel={setReading}
          onDecoded={setPresent}
          sx={{
            width: '100%',
            height: '85vh',
            objectFit: 'contain'
          }}
        />
      </DialogContent>
      <DialogActions sx={{ bgcolor: onImage.backdrop, p: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
            mr: "auto"
          }}>
          <Chip label={kindLabel} size="small" sx={{ bgcolor: onImage.chip, color: onImage.ink }} />
          {image.epoch !== undefined && (
            <Chip label={`Epoch ${image.epoch}`} size="small" sx={{ bgcolor: onImage.chip, color: onImage.ink }} />
          )}
          {decoded && <OutputLegend kind={decoded} classes={classes} present={present} color={onImage.ink} />}
          {decoded && (
            <Typography variant="caption" aria-live="polite" sx={{ color: onImage.ink, minWidth: 140 }}>
              {reading ?? 'Point at a pixel to read it'}
            </Typography>
          )}
        </Box>
        <Button onClick={onClose} sx={{ color: onImage.ink }}>Close</Button>
      </DialogActions>
    </>
  );
};

const ImageViewDialog: React.FC<ImageViewDialogProps> = ({
  open,
  onClose,
  selectedImage,
  classes
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="xl"
    fullWidth
    slotProps={{ paper: { sx: { borderRadius: 2, bgcolor: onImage.backdrop } } }}
  >
    <DialogTitle sx={{ color: onImage.ink, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="subtitle1" component="span" sx={{ overflowWrap: 'anywhere' }}>{selectedImage?.filename}</Typography>
      <IconButton onClick={onClose} aria-label="Close dialog" sx={{ color: onImage.ink }}>
        <CloseIcon />
      </IconButton>
    </DialogTitle>
    {selectedImage ? (
      <Viewer key={selectedImage.visualization_uuid} image={selectedImage} classes={classes} onClose={onClose} />
    ) : (
      <DialogActions sx={{ bgcolor: onImage.backdrop, p: 2 }}>
        <Button onClick={onClose} sx={{ color: onImage.ink }}>Close</Button>
      </DialogActions>
    )}
  </Dialog>
);

export default ImageViewDialog;
