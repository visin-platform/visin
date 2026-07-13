import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Paper
} from '@mui/material';
import { Config } from '../../types';

interface EditConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  config: Config | null;
  configName: string;
  onConfigNameChange: (name: string) => void;
  loading: boolean;
}

const EditConfigDialog: React.FC<EditConfigDialogProps> = ({
  open,
  onClose,
  onSave,
  config,
  configName,
  onConfigNameChange,
  loading
}) => {
  // Format config data for display
  const formatConfigData = (data: unknown, depth: number = 0): React.ReactNode => {
    if (depth > 3) return null; // Limit nesting depth for display
    
    if (typeof data !== 'object' || data === null) {
      return String(data);
    }

    if (Array.isArray(data)) {
      return `[${data.join(', ')}]`;
    }

    return (
      <Box sx={{ pl: 2 }}>
        {Object.entries(data).map(([key, value]) => (
          <Box key={key} sx={{ mb: 1 }}>
            <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
              {key}:
            </Typography>{' '}
            <Typography variant="body2" component="span">
              {typeof value === 'object' && value !== null
                ? formatConfigData(value, depth + 1)
                : String(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Edit Config</DialogTitle>
      <DialogContent sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {config && (
          <Box sx={{ py: 2 }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Config Name:
              </Typography>
              <TextField
                autoFocus
                margin="dense"
                label="Config Name"
                fullWidth
                variant="outlined"
                value={configName}
                onChange={(e) => onConfigNameChange(e.target.value)}
                placeholder="Enter config name..."
                disabled={loading}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Config UUID:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', mb: 2 }}
              >
                {config.config_uuid}
              </Typography>

              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Summary:
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {config.summary}
              </Typography>
            </Box>

            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Config Data:
            </Typography>
            <Paper sx={{ p: 2, backgroundColor: '#f9f9f9', overflow: 'auto', maxHeight: '300px' }}>
              {formatConfigData(config.config_data)}
            </Paper>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={loading || !configName.trim()}
        >
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditConfigDialog;
