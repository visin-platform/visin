import React from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';

interface UploadResultsDialogProps {
  open: boolean;
  onClose: () => void;
  results: {
    successful: Array<{ name: string; operation: string }>;
    failed: Array<{ name: string; error: string }>;
  };
}

const UploadResultsDialog: React.FC<UploadResultsDialogProps> = ({ open, onClose, results }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Upload Results</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Successful Files */}
          {results.successful.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{
                color: "success.main"
              }}>
                Successfully Processed ({results.successful.length})
              </Typography>
              <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'success.light', borderRadius: 1, p: 1 }}>
                {results.successful.map((file, index) => (
                  <Typography key={index} variant="body2" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{file.name}</span>
                    <span style={{ color: 'green', fontWeight: 'bold' }}>({file.operation})</span>
                  </Typography>
                ))}
              </Box>
            </Box>
          )}

          {/* Failed Files */}
          {results.failed.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{
                color: "error.main"
              }}>
                Failed to Process ({results.failed.length})
              </Typography>
              <Box sx={{ maxHeight: 200, overflowY: 'auto', border: 1, borderColor: 'error.light', borderRadius: 1, p: 1 }}>
                {results.failed.map((file, index) => (
                  <Box key={index} sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{
                      fontWeight: "bold"
                    }}>
                      {file.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: "error.main",
                        ml: 2
                      }}>
                      {file.error}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default UploadResultsDialog;
