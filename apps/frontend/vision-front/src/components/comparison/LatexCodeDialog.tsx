import React from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Paper
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';

interface LatexCodeDialogProps {
  open: boolean;
  onClose: () => void;
  latexCode: string;
  copyToClipboard: (text: string) => void;
}

const LatexCodeDialog: React.FC<LatexCodeDialogProps> = ({
  open,
  onClose,
  latexCode,
  copyToClipboard
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        LaTeX Table Code
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ position: 'relative' }}>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: 'background.default',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              maxHeight: '400px',
              overflow: 'auto',
              fontSize: '0.875rem'
            }}
          >
            {latexCode}
          </Paper>
          <Button
            startIcon={<ContentCopyIcon />}
            size="small"
            sx={{ position: 'absolute', top: 8, right: 8 }}
            onClick={() => copyToClipboard(latexCode)}
          >
            Copy
          </Button>
        </Box>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            mt: 1,
            display: 'block'
          }}>
          This code generates a LaTeX table comparing the selected trainings. You can paste this directly into your LaTeX document.
          Requires the <code>booktabs</code> and <code>xcolor</code> packages.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LatexCodeDialog;
