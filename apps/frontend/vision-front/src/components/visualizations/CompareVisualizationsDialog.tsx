import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  Grid,
  Paper,
  Box,
  Chip,
  Button
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { Visualization } from '../../types';

interface CompareVisualizationsDialogProps {
  open: boolean;
  onClose: () => void;
  selectedForCompare: Visualization[];
}

const CompareVisualizationsDialog: React.FC<CompareVisualizationsDialogProps> = ({
  open,
  onClose,
  selectedForCompare
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xl" 
      fullWidth
      PaperProps={{ sx: { borderRadius: 2, height: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Compare Visualizations</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ height: '100%' }}>
          {selectedForCompare.map(viz => (
            <Grid size={{ xs: 12, md: selectedForCompare.length === 2 ? 6 : 6, lg: selectedForCompare.length === 2 ? 6 : 3 }} key={viz.visualization_uuid}>
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  bgcolor: 'background.default'
                }}
              >
                <Box mb={2}>
                  <Chip 
                    label={viz.type} 
                    size="small" 
                    color="primary" 
                    sx={{ mr: 1, textTransform: 'uppercase', fontWeight: 600, fontSize: '0.7rem' }} 
                  />
                  <Chip 
                    label={`Epoch ${viz.epoch}`} 
                    size="small" 
                    variant="outlined" 
                    sx={{ fontWeight: 600, fontSize: '0.7rem' }} 
                  />
                </Box>
                
                <Box 
                  sx={{ 
                    flexGrow: 1, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    bgcolor: 'grey.100',
                    borderRadius: 1,
                    overflow: 'hidden',
                    mb: 2
                  }}
                >
                  <Box
                    component="img"
                    src={viz.signedUrl || ''}
                    alt={viz.filename}
                    sx={{
                      maxWidth: '100%',
                      maxHeight: '60vh',
                      objectFit: 'contain'
                    }}
                  />
                </Box>
                
                <Typography variant="caption" color="text.secondary" align="center" display="block" fontFamily="monospace">
                  {viz.filename}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CompareVisualizationsDialog;
