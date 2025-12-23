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
import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';

interface LatexExportDialogProps {
  open: boolean;
  onClose: () => void;
  latexCode: string;
}

const LatexExportDialog: React.FC<LatexExportDialogProps> = ({ open, onClose, latexCode }) => {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(latexCode);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Export Results as LaTeX</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" color="text.secondary" paragraph>
          You can copy the LaTeX code below and paste it into your LaTeX document to include the results table.
        </Typography>
        <Box
          component="pre"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            p: 2,
            bgcolor: 'grey.50',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'grey.300',
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          {latexCode}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Close</Button>
        <Button 
          onClick={copyToClipboard} 
          variant="contained" 
          startIcon={<ContentCopyIcon />}
        >
          Copy to Clipboard
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LatexExportDialog;
