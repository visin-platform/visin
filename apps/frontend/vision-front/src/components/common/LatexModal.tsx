import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Paper
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as ContentCopyIcon } from '@mui/icons-material';

interface LatexModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  code: string;
}

const LatexModal: React.FC<LatexModalProps> = ({ 
  open, 
  onClose, 
  title, 
  code
}) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
          {title}
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ position: 'relative' }}>
          <Button
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            size="small"
            sx={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}
          >
            Copy
          </Button>
          <Paper
            sx={{
              p: 2,
              bgcolor: 'background.default',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              maxHeight: '60vh',
              overflow: 'auto'
            }}
          >
            {code}
          </Paper>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LatexModal;
