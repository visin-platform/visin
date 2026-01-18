import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import { Close as CloseIcon, ContentCopy as ContentCopyIcon } from '@mui/icons-material';

interface LatexModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  code: string;
  decimals?: number;
  multiplier?: number;
  onDecimalsChange?: (decimals: number) => void;
  onMultiplierChange?: (multiplier: number) => void;
}

const LatexModal: React.FC<LatexModalProps> = ({ 
  open, 
  onClose, 
  title, 
  code,
  decimals = 2,
  multiplier = 100,
  onDecimalsChange,
  onMultiplierChange
}) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          {title}
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        {/* Number Formatting Controls */}
        <Box sx={{ mb: 3, p: 2, bgcolor: '#f9f9f9', borderRadius: 1 }}>
          <Typography variant="h6" gutterBottom>
            Number Formatting Options
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
              <FormControl fullWidth size="small">
                <InputLabel>Decimal Places</InputLabel>
                <Select
                  value={decimals}
                  label="Decimal Places"
                  onChange={(e) => onDecimalsChange?.(Number(e.target.value))}
                >
                  <MenuItem value={0}>0</MenuItem>
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={3}>3</MenuItem>
                  <MenuItem value={4}>4</MenuItem>
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={6}>6</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ flex: '1 1 200px', minWidth: '150px' }}>
              <TextField
                fullWidth
                size="small"
                label="Multiply by"
                type="number"
                value={multiplier}
                onChange={(e) => onMultiplierChange?.(Number(e.target.value))}
                inputProps={{ min: 0.001, step: 0.1 }}
              />
            </Box>
          </Box>
        </Box>

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
              bgcolor: '#f5f5f5',
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